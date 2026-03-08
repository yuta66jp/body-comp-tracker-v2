"""
enrich.py — TDEE逆算・SMA計算・データ加工バッチ
旧: logic.py の enrich_data() を移植

実行: python ml-pipeline/enrich.py
"""

import logging
import os
from datetime import datetime

import numpy as np
import pandas as pd
from supabase import create_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

KCAL_PER_KG_FAT = 7_200  # Hall et al., 2012 (旧6800から統一)
SMA_WINDOW = 7


def fetch_daily_logs(client) -> pd.DataFrame:
    response = client.table("daily_logs").select("*").order("log_date").execute()
    return pd.DataFrame(response.data)


def enrich_data(df: pd.DataFrame) -> pd.DataFrame:
    """TDEE逆算・SMA等を追加して返す。冪等性のため既存列を先に削除する。"""
    for col in ["weight_sma7", "tdee_estimated"]:
        if col in df.columns:
            df = df.drop(columns=[col])

    df = df.copy()
    df["log_date"] = pd.to_datetime(df["log_date"])
    df = df.sort_values("log_date").reset_index(drop=True)

    # 7日間単純移動平均
    df["weight_sma7"] = df["weight"].rolling(window=SMA_WINDOW, min_periods=1).mean()

    # TDEE逆算 (体重差分とカロリーから推定)
    weight_delta = df["weight"].diff()  # kg/day
    energy_balance = weight_delta * KCAL_PER_KG_FAT
    df["tdee_estimated"] = df["calories"] - energy_balance

    return df


def main() -> None:
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    client = create_client(url, key)

    logger.info("Fetching daily_logs...")
    df = fetch_daily_logs(client)

    if df.empty:
        logger.warning("No data found in daily_logs. Skipping.")
        return

    logger.info("Enriching data (%d rows)...", len(df))
    enriched = enrich_data(df)

    # analytics_cache に JSONB として保存 (upsert で冪等)
    payload = enriched[["log_date", "weight_sma7", "tdee_estimated"]].copy()
    payload["log_date"] = payload["log_date"].dt.strftime("%Y-%m-%d")
    payload = payload.where(pd.notna(payload), None)

    client.table("analytics_cache").upsert(
        {
            "metric_type": "enriched_logs",
            "payload": payload.to_dict(orient="records"),
            "updated_at": datetime.utcnow().isoformat(),
        }
    ).execute()
    logger.info("Saved enriched_logs to analytics_cache.")


if __name__ == "__main__":
    main()
