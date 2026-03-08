"""
predict.py — NeuralProphet 体重予測バッチ
旧: logic.py の run_neural_model() / run_metabolic_simulation() を移植

実行: python ml-pipeline/predict.py
"""

import logging
import math
import os
from datetime import datetime, timezone, timedelta

import pandas as pd
from neuralprophet import NeuralProphet
from supabase import create_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

MODEL_VERSION = "neuralprophet-v1"
FORECAST_DAYS = 180  # 大会日が半年先でもカバーできるよう拡張（旧版は90日）
ADAPTATION_FACTOR = 30  # 代謝適応係数 (日数)


def fetch_daily_logs(client) -> pd.DataFrame:
    response = client.table("daily_logs").select("log_date,weight").order("log_date").execute()
    df = pd.DataFrame(response.data)
    df = df.dropna(subset=["weight"])
    df["ds"] = pd.to_datetime(df["log_date"])
    df["y"] = df["weight"].astype(float)
    return df[["ds", "y"]]


def run_model(df: pd.DataFrame) -> pd.DataFrame:
    """NeuralProphet で予測を実行する。"""
    model = NeuralProphet(
        n_lags=0,
        epochs=500,
        weekly_seasonality=True,
        daily_seasonality=False,
    )
    model.fit(df, freq="D", progress=None)

    future = model.make_future_dataframe(df, periods=FORECAST_DAYS, n_historic_predictions=0)
    forecast = model.predict(future)
    return forecast[["ds", "yhat1"]].rename(columns={"yhat1": "yhat"})


def main() -> None:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        logger.error(
            "Missing required environment variables: SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY"
        )
        raise SystemExit(1)

    client = create_client(url, key)

    logger.info("Fetching weight data from daily_logs...")
    try:
        df = fetch_daily_logs(client)
    except Exception as e:
        logger.error("Failed to fetch daily_logs: %s", e)
        raise SystemExit(1)

    logger.info("Fetched %d rows with weight data.", len(df))

    if len(df) < 14:
        logger.warning("Insufficient data (%d rows). Skipping prediction.", len(df))
        return

    logger.info("Running NeuralProphet (rows=%d)...", len(df))
    try:
        forecast = run_model(df)
    except Exception as e:
        logger.error("NeuralProphet model failed: %s", e)
        raise SystemExit(1)

    records = [
        {
            "ds": row["ds"].strftime("%Y-%m-%d"),
            "yhat": yhat if math.isfinite(yhat := round(float(row["yhat"]), 3)) else None,
            "model_version": MODEL_VERSION,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        for _, row in forecast.iterrows()
        if not forecast.empty
    ]
    records = [r for r in records if r["yhat"] is not None]

    logger.info("Upserting %d predictions to 'predictions' table...", len(records))
    try:
        # 既存の予測を削除してから upsert (日付単位で冪等)
        client.table("predictions").upsert(records, on_conflict="ds").execute()
    except Exception as e:
        logger.error("Failed to upsert predictions: %s", e)
        raise SystemExit(1)

    logger.info("Done. Upserted %d predictions to 'predictions'.", len(records))


if __name__ == "__main__":
    main()
