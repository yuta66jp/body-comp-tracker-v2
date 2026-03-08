"""
analyze.py — XGBoost 因子分析バッチ
旧: logic.py の run_xgboost_importance() を移植

current_weight を説明変数から除外してリーケージを防ぐ。
結果は analytics_cache.payload (JSONB) に保存する。

実行: python ml-pipeline/analyze.py
"""

import logging
import math
import os
from datetime import datetime, timezone

import numpy as np
import pandas as pd
import xgboost as xgb
from supabase import create_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# current_weight は除外 (リーケージ対策)
FEATURE_COLS = ["calories", "protein", "fat", "carbs"]
TARGET_COL = "weight"


def fetch_daily_logs(client) -> pd.DataFrame:
    response = client.table("daily_logs").select("*").order("log_date").execute()
    return pd.DataFrame(response.data)


def run_importance(df: pd.DataFrame) -> dict[str, float]:
    """XGBoost で特徴量重要度を計算して返す。"""
    df = df.dropna(subset=FEATURE_COLS + [TARGET_COL])

    # 翌日の体重を予測ターゲットにする (当日の current_weight を使わない)
    df = df.copy()
    df["target"] = df[TARGET_COL].shift(-1)
    df = df.dropna(subset=["target"])

    X = df[FEATURE_COLS].values
    y = df["target"].values

    model = xgb.XGBRegressor(n_estimators=200, max_depth=4, random_state=42, verbosity=0)
    model.fit(X, y)

    importance = dict(zip(FEATURE_COLS, model.feature_importances_.tolist()))
    return importance


def main() -> None:
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    client = create_client(url, key)

    logger.info("Fetching daily_logs...")
    df = fetch_daily_logs(client)

    if len(df) < 30:
        logger.warning("Insufficient data (%d rows). Skipping analysis.", len(df))
        return

    logger.info("Running XGBoost importance...")
    importance = run_importance(df)
    logger.info("Importance: %s", importance)

    client.table("analytics_cache").upsert(
        {
            "metric_type": "xgboost_importance",
            "payload": importance,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
    ).execute()
    logger.info("Saved xgboost_importance to analytics_cache.")


if __name__ == "__main__":
    main()
