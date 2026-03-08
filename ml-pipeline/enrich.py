"""
enrich.py — TDEE逆算・SMA計算・データ加工バッチ
旧: logic.py の enrich_data() を移植

実行: python ml-pipeline/enrich.py
"""

import logging
import math
import os
from datetime import datetime, timezone

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

    if df.empty:
        logger.warning("No data found in daily_logs. Skipping.")
        return

    logger.info("Enriching data (%d rows)...", len(df))
    enriched = enrich_data(df)

    # analytics_cache に JSONB として保存 (upsert で冪等)
    payload = enriched[["log_date", "weight_sma7", "tdee_estimated"]].copy()
    payload["log_date"] = payload["log_date"].dt.strftime("%Y-%m-%d")
    # inf → NaN → None の順で正規化
    payload = payload.replace([np.inf, -np.inf], np.nan)
    payload = payload.where(pd.notna(payload), None)

    # to_dict() が None を NaN に戻すため、dict 変換後にも非有限値を除去する
    def sanitize(record: dict) -> dict:
        return {
            k: (None if isinstance(v, float) and not math.isfinite(v) else v)
            for k, v in record.items()
        }

    records = [sanitize(r) for r in payload.to_dict(orient="records")]

    logger.info("Saving enriched_logs (%d records) to 'analytics_cache'...", len(records))
    try:
        client.table("analytics_cache").upsert(
            {
                "metric_type": "enriched_logs",
                "payload": records,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        ).execute()
    except Exception as e:
        logger.error("Failed to save analytics_cache: %s", e)
        raise SystemExit(1)

    logger.info("Done. Saved %d enriched records to 'analytics_cache'.", len(records))


if __name__ == "__main__":
    main()
