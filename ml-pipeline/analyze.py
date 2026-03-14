"""
analyze.py — XGBoost 因子分析バッチ
旧: logic.py の run_xgboost_importance() を移植

■ 目的変数 (target):
    翌日体重変化量 = weight(t+1) - weight(t)
    符号: 増加を正、減少を負。
    current_weight を説明変数から除外してリーケージを防ぐ。

■ 特徴量:
    旧版に合わせて cal_lag1 / rolling_cal_7 / p_lag1 / f_lag1 / c_lag1 の 5 特徴を使用。

■ 出力:
    結果は analytics_cache.payload (JSONB) に保存する。

実行: python ml-pipeline/analyze.py

■ モジュール構成 (責務分離):
    トップレベル import: 軽量標準ライブラリ + pandas のみ
    xgboost  : run_importance() 内で遅延 import（分析実行時のみ必要）
    supabase : main() 内で遅延 import（I/O 実行時のみ必要）

    純粋ロジック層 (ファイル I/O・外部依存なし):
        apply_feature_engineering() — 欠損除去・特徴量計算・target 計算
        run_importance()            — XGBoost 学習・重要度算出
        compute_meta()             — サンプル数・日付範囲などの前提情報算出
        build_payload()            — importance + meta → analytics_cache 形式へ合成

    外部 I/O 層 (supabase 依存):
        fetch_daily_logs()         — daily_logs テーブルから全件取得
        save_analytics_cache()     — analytics_cache テーブルへ upsert

    実行入口:
        main()                     — 環境変数解決・エラーハンドリング・各層の呼び出し
"""

import logging
import os
from datetime import datetime, timezone

import pandas as pd

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


# ── 純粋ロジック層 ─────────────────────────────────────────────────────────────


def apply_feature_engineering(df: pd.DataFrame) -> pd.DataFrame:
    """欠損除去・ソート・特徴量エンジニアリング・target 計算を適用した DataFrame を返す。

    run_importance() と compute_meta() の両方がこの関数を経由することで、
    特徴量エンジニアリングのロジックをここに一元化する。

    返す DataFrame の末尾 1 行は target が NaN（shift(-1) によるもの）。
    呼び出し側で dropna(subset=FEATURE_COLS + ["target"]) を行うこと。

    入力 df を変更しない（内部で copy する）。
    xgboost / supabase を必要としない純粋変換。
    """
    df = df.copy()
    df = df.dropna(subset=["weight", "calories", "protein", "fat", "carbs"])
    df = df.sort_values("log_date").reset_index(drop=True)

    df["cal_lag1"]      = df["calories"]
    df["rolling_cal_7"] = df["calories"].rolling(window=7, min_periods=1).mean()
    df["p_lag1"]        = df["protein"]
    df["f_lag1"]        = df["fat"]
    df["c_lag1"]        = df["carbs"]

    # ── 目的変数: 翌日体重変化量 = weight(t+1) - weight(t) ──────────────────
    # 「翌日体重の絶対値」ではなく「翌日の変化量（増加=正、減少=負）」を予測する。
    # これにより「炭水化物・脚トレ・睡眠などが翌日体重をどれだけ動かすか」という
    # 解釈しやすい目的変数になる。current_weight は説明変数から除外済み（リーケージ回避）。
    #
    # ── 将来拡張メモ ─────────────────────────────────────────────────────────
    # 今回は最も単純で解釈しやすい「翌日変化量」を採用する。
    # 将来比較したい target 候補:
    #   - 2日後変化量:       weight.shift(-2) - weight
    #   - 3日移動平均との差: rolling(3).mean().shift(-1) - weight  ← 定義は要検討
    # 足トレや高糖質の影響は翌日だけでなく 2 日程度残る可能性があるため、
    # データが十分に蓄積されたタイミングで比較実験すること。
    # 追加するには本関数に `target_type` 引数を設け、上記の計算式を分岐させる。
    # ─────────────────────────────────────────────────────────────────────────
    df["target"] = df["weight"].shift(-1) - df["weight"]

    return df


def run_importance(df: pd.DataFrame) -> dict[str, dict[str, float | str]]:
    """XGBoost で特徴量重要度を計算して返す。

    xgboost はこの関数内で遅延 import する（分析実行時のみ必要）。
    import analyze 時に xgboost が要求されないよう意図的に遅延させている。

    Returns:
        特徴量名をキーとする辞書。各値は以下のキーを持つ辞書:
        - label (str): 日本語ラベル
        - importance (float): XGBoost の feature_importances_ の生値（0〜1）
        - pct (float): 全特徴量合計に対する割合（%）

    Raises:
        ValueError: 有効行数が MIN_ROWS 未満のとき
    """
    try:
        import xgboost as xgb  # 遅延 import: 分析実行時のみ必要
    except ImportError as e:
        raise ImportError(
            "xgboost が未導入です。pip install xgboost でインストールしてください。"
        ) from e

    df = apply_feature_engineering(df)
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


def compute_meta(df: pd.DataFrame) -> dict[str, object]:
    """分析前提情報（サンプル数・日付範囲・除外数）を計算して返す。

    apply_feature_engineering() 経由で run_importance() と同じ前処理を参照する。
    xgboost / supabase を必要としない純粋関数。

    Returns:
        _meta キー向けの辞書:
        - sample_count (int): 有効サンプル数（欠損除外 + shift(-1) 末尾除外後）
        - date_from (str | None): 有効サンプルの最古日付。サンプルなしなら None
        - date_to (str | None): 有効サンプルの最新日付。サンプルなしなら None
        - total_rows (int): 入力 df の行数（フィルタ前）
        - dropped_count (int): 欠損除外 + shift(-1) 末尾除外の合計
    """
    total_rows = int(len(df))
    df_proc = apply_feature_engineering(df)
    df_proc = df_proc.dropna(subset=FEATURE_COLS + ["target"])
    sample_count = int(len(df_proc))
    return {
        "sample_count":  sample_count,
        "date_from":     str(df_proc["log_date"].iloc[0])  if sample_count > 0 else None,
        "date_to":       str(df_proc["log_date"].iloc[-1]) if sample_count > 0 else None,
        "total_rows":    total_rows,
        "dropped_count": total_rows - sample_count,
    }


def build_payload(importance: dict, meta: dict) -> dict:
    """importance と meta を analytics_cache.payload 形式に合成する。

    Returns:
        {"_meta": meta, **importance}
    """
    return {"_meta": meta, **importance}


# ── 外部 I/O 層 ───────────────────────────────────────────────────────────────


def fetch_daily_logs(client) -> pd.DataFrame:
    """Supabase から daily_logs を全件取得して DataFrame で返す。"""
    response = client.table("daily_logs").select("*").order("log_date").execute()
    return pd.DataFrame(response.data)


def save_analytics_cache(client, metric_type: str, payload: dict) -> None:
    """analytics_cache テーブルに payload を upsert する。"""
    client.table("analytics_cache").upsert(
        {
            "metric_type": metric_type,
            "payload": payload,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
    ).execute()


# ── 実行入口 ──────────────────────────────────────────────────────────────────


def main() -> None:
    from supabase import create_client  # 遅延 import: I/O 実行時のみ必要

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

    meta = compute_meta(df)
    payload = build_payload(importance, meta)

    logger.info("Saving xgboost_importance to 'analytics_cache'...")
    try:
        save_analytics_cache(client, "xgboost_importance", payload)
    except Exception as e:
        logger.error("Failed to save analytics_cache: %s", e)
        raise SystemExit(1)

    logger.info("Done. Saved xgboost_importance to 'analytics_cache'.")


if __name__ == "__main__":
    main()
