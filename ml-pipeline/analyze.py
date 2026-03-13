"""
analyze.py — XGBoost 因子分析バッチ
旧: logic.py の run_xgboost_importance() を移植

current_weight を説明変数から除外してリーケージを防ぐ。
旧版に合わせて cal_lag1 / rolling_cal_7 / p_lag1 / f_lag1 / c_lag1 の 5 特徴を使用。
結果は analytics_cache.payload (JSONB) に保存する。

実行: python ml-pipeline/analyze.py
"""

import logging
import os
from datetime import datetime, timezone

import pandas as pd
import xgboost as xgb
from supabase import create_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# 旧版と同じ 5 特徴 (current_weight はリーケージのため除外)
FEATURE_COLS = ["cal_lag1", "rolling_cal_7", "p_lag1", "f_lag1", "c_lag1"]
FEATURE_LABELS = {
    # フロントエンド featureLabels.ts の FEATURE_LABEL_MAP と同期すること
    "cal_lag1":      "摂取 kcal（当日）",
    "rolling_cal_7": "摂取 kcal（週平均）",
    "p_lag1":        "タンパク質（g）",
    "f_lag1":        "脂質（g）",
    "c_lag1":        "炭水化物（g）",
}
MIN_ROWS = 14


def fetch_daily_logs(client) -> pd.DataFrame:
    response = client.table("daily_logs").select("*").order("log_date").execute()
    return pd.DataFrame(response.data)


def run_importance(df: pd.DataFrame) -> dict[str, dict[str, float | str]]:
    """XGBoost で特徴量重要度を計算して返す。

    Returns:
        特徴量名をキーとする辞書。各値は以下のキーを持つ辞書:
        - label (str): 日本語ラベル
        - importance (float): XGBoost の feature_importances_ の生値（0〜1）
        - pct (float): 全特徴量合計に対する割合（%）
    """
    df = df.copy()
    df = df.dropna(subset=["weight", "calories", "protein", "fat", "carbs"])
    df = df.sort_values("log_date").reset_index(drop=True)

    # 特徴量エンジニアリング (旧版踏襲)
    df["cal_lag1"] = df["calories"]
    df["rolling_cal_7"] = df["calories"].rolling(window=7, min_periods=1).mean()
    df["p_lag1"] = df["protein"]
    df["f_lag1"] = df["fat"]
    df["c_lag1"] = df["carbs"]

    # ターゲット: 翌日の体重変化 (リーケージ回避)
    df["target"] = df["weight"].shift(-1)
    df = df.dropna(subset=FEATURE_COLS + ["target"])

    if len(df) < MIN_ROWS:
        raise ValueError(f"有効行数が不足 ({len(df)} < {MIN_ROWS})")

    X = df[FEATURE_COLS].values
    y = df["target"].values

    model = xgb.XGBRegressor(n_estimators=100, max_depth=3, random_state=42, verbosity=0)
    model.fit(X, y)

    raw = dict(zip(FEATURE_COLS, model.feature_importances_.tolist()))

    # ラベルと重要度（%）を合わせて返す
    total = sum(raw.values()) or 1.0
    return {
        col: {
            "label": FEATURE_LABELS[col],
            "importance": round(raw[col], 6),
            "pct": round(raw[col] / total * 100, 1),
        }
        for col in FEATURE_COLS
    }


def main() -> None:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        logger.error(
            "Missing required environment variables: SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY"
        )
        raise SystemExit(1)

    client = create_client(url, key)

    logger.info("Fetching daily_logs...")
    try:
        df = fetch_daily_logs(client)
    except Exception as e:
        logger.error("Failed to fetch daily_logs: %s", e)
        raise SystemExit(1)

    logger.info("Fetched %d rows from daily_logs.", len(df))

    if len(df) < MIN_ROWS:
        logger.warning("Insufficient data (%d rows). Skipping analysis.", len(df))
        return

    logger.info("Running XGBoost importance (rows=%d)...", len(df))
    try:
        importance = run_importance(df)
    except ValueError as e:
        logger.warning("Skipping: %s", e)
        return
    except Exception as e:
        logger.error("XGBoost training failed: %s", e)
        raise SystemExit(1)

    logger.info("Importance: %s", importance)

    # 分析前提情報を計算（run_importance と同じフィルタを適用）
    df_meta = df.dropna(subset=["weight", "calories", "protein", "fat", "carbs"])
    df_meta = df_meta.sort_values("log_date").reset_index(drop=True)
    df_meta = df_meta.assign(target=df_meta["weight"].shift(-1))
    df_meta = df_meta.dropna(subset=FEATURE_COLS + ["target"])
    sample_count = int(len(df_meta))
    total_rows   = int(len(df))
    meta: dict[str, object] = {
        "sample_count":  sample_count,
        "date_from":     str(df_meta["log_date"].iloc[0]) if sample_count > 0 else None,
        "date_to":       str(df_meta["log_date"].iloc[-1]) if sample_count > 0 else None,
        "total_rows":    total_rows,
        "dropped_count": total_rows - sample_count,  # 欠損除外 + shift(-1) による末尾除外の合計
    }
    payload = {"_meta": meta, **importance}

    logger.info("Saving xgboost_importance to 'analytics_cache'...")
    try:
        client.table("analytics_cache").upsert(
            {
                "metric_type": "xgboost_importance",
                "payload": payload,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        ).execute()
    except Exception as e:
        logger.error("Failed to save analytics_cache: %s", e)
        raise SystemExit(1)

    logger.info("Done. Saved xgboost_importance to 'analytics_cache'.")


if __name__ == "__main__":
    main()
