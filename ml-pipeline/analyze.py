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
    "cal_lag1": "カロリー（当日）",
    "rolling_cal_7": "カロリー（週平均）",
    "p_lag1": "タンパク質",
    "f_lag1": "脂質",
    "c_lag1": "炭水化物",
}
MIN_ROWS = 14


def fetch_daily_logs(client) -> pd.DataFrame:
    response = client.table("daily_logs").select("*").order("log_date").execute()
    return pd.DataFrame(response.data)


def run_importance(df: pd.DataFrame) -> dict[str, float]:
    """XGBoost で特徴量重要度を計算して返す。"""
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

    logger.info("Saving xgboost_importance to 'analytics_cache'...")
    try:
        client.table("analytics_cache").upsert(
            {
                "metric_type": "xgboost_importance",
                "payload": importance,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        ).execute()
    except Exception as e:
        logger.error("Failed to save analytics_cache: %s", e)
        raise SystemExit(1)

    logger.info("Done. Saved xgboost_importance to 'analytics_cache'.")


if __name__ == "__main__":
    main()
