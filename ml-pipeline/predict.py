"""
predict.py — NeuralProphet 体重予測バッチ
旧: logic.py の run_neural_model() / run_metabolic_simulation() を移植

実行: python ml-pipeline/predict.py

■ モジュール構成 (責務分離):
    トップレベル import: 軽量標準ライブラリ + pandas のみ
    torch          : run_model() 内で遅延 import（重い + CVE patch が必要なため実行時のみ）
    neuralprophet  : run_model() 内で遅延 import（torch 依存のため実行時のみ必要）
    supabase       : main() 内で遅延 import（I/O 実行時のみ必要）

    純粋ロジック層 (ファイル I/O・外部依存なし):
        run_model()        — NeuralProphet 学習・予測（torch/neuralprophet は内部で遅延 import）

    外部 I/O 層 (supabase 依存):
        fetch_daily_logs() — daily_logs テーブルから体重データを取得
        save_predictions() — predictions テーブルへ upsert

    実行入口:
        main()             — 環境変数解決・エラーハンドリング・各層の呼び出し
"""

import logging
import math
import os
from datetime import datetime, timezone

import pandas as pd

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

MODEL_VERSION = "neuralprophet-v1"
FORECAST_DAYS = 180  # 大会日が半年先でもカバーできるよう拡張（旧版は90日）
ADAPTATION_FACTOR = 30  # 代謝適応係数 (日数)
MIN_ROWS = 14


# ── 純粋ロジック層 ─────────────────────────────────────────────────────────────


def run_model(df: pd.DataFrame) -> pd.DataFrame:
    """NeuralProphet で予測を実行して予測 DataFrame を返す。

    torch / neuralprophet はこの関数内で遅延 import する（重い依存かつ実行時のみ必要）。
    torch 2.6+ の weights_only デフォルト変更に対する patch もここで適用する。
    import predict 時に torch / neuralprophet が要求されないよう意図的に遅延させている。

    Args:
        df: "ds" (datetime) と "y" (float) 列を持つ DataFrame。

    Returns:
        "ds" と "yhat" 列を持つ予測 DataFrame。
    """
    try:
        import torch as _torch
    except ImportError as e:
        raise ImportError(
            "torch が未導入です。pip install torch でインストールしてください。"
        ) from e

    try:
        from neuralprophet import NeuralProphet
    except ImportError as e:
        raise ImportError(
            "neuralprophet が未導入です。pip install neuralprophet でインストールしてください。"
        ) from e

    # torch 2.6+ changed weights_only default to True, which breaks pytorch-lightning's
    # LR-finder checkpoint restore when loading NeuralProphet objects.
    # This pipeline only ever loads checkpoints it wrote itself in the same run (trusted),
    # so overriding weights_only=False is safe here.
    if tuple(int(x) for x in _torch.__version__.split(".")[:2]) >= (2, 6):
        _orig_torch_load = _torch.load

        def _trusted_load(f, map_location=None, pickle_module=None, weights_only=None, mmap=None, **kw):
            return _orig_torch_load(f, map_location=map_location, weights_only=False, **kw)

        _torch.load = _trusted_load

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


# ── 外部 I/O 層 ───────────────────────────────────────────────────────────────


def fetch_daily_logs(client) -> pd.DataFrame:
    """Supabase から daily_logs を取得して予測用 DataFrame で返す。"""
    response = client.table("daily_logs").select("log_date,weight").order("log_date").execute()
    df = pd.DataFrame(response.data)
    df = df.dropna(subset=["weight"])
    df["ds"] = pd.to_datetime(df["log_date"])
    df["y"] = df["weight"].astype(float)
    return df[["ds", "y"]]


def save_predictions(client, records: list[dict]) -> None:
    """predictions テーブルに予測結果を upsert する。"""
    client.table("predictions").upsert(records, on_conflict="ds").execute()


# ── 実行入口 ──────────────────────────────────────────────────────────────────


def main() -> None:
    try:
        from supabase import create_client  # 遅延 import: I/O 実行時のみ必要
    except ImportError as e:
        raise ImportError(
            "supabase が未導入です。pip install supabase でインストールしてください。"
        ) from e

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

    if len(df) < MIN_ROWS:
        logger.warning("Insufficient data (%d rows). Skipping prediction.", len(df))
        return

    logger.info("Running NeuralProphet (rows=%d)...", len(df))
    try:
        forecast = run_model(df)
    except Exception as e:
        logger.error("NeuralProphet model failed: %s", e)
        raise SystemExit(1)

    if forecast.empty:
        logger.warning("Forecast result is empty. Skipping upsert.")
        return

    # created_at は全レコード共通で1回だけ生成する
    created_at = datetime.now(timezone.utc).isoformat()

    # iterrows() より itertuples() の方がメモリ効率が良い
    records = []
    for row in forecast.itertuples(index=False):
        yhat = round(float(row.yhat), 3)
        if math.isfinite(yhat):
            records.append(
                {
                    "ds": row.ds.strftime("%Y-%m-%d"),
                    "yhat": yhat,
                    "model_version": MODEL_VERSION,
                    "created_at": created_at,
                }
            )

    logger.info("Upserting %d predictions to 'predictions' table...", len(records))
    try:
        save_predictions(client, records)
    except Exception as e:
        logger.error("Failed to upsert predictions: %s", e)
        raise SystemExit(1)

    logger.info("Done. Upserted %d predictions to 'predictions'.", len(records))


if __name__ == "__main__":
    main()
