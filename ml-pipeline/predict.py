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
from datetime import date, datetime, timedelta, timezone

import pandas as pd

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

MODEL_VERSION = "neuralprophet-v1"
FORECAST_DAYS = 180  # 大会日が半年先でもカバーできるよう拡張（旧版は90日）
ADAPTATION_FACTOR = 30  # 代謝適応係数 (日数)

# 長期イベント除外の定数 (backtest.py の _DEFAULT_LONG_EVENT_THRESHOLD と同値で同期する)
# 5日以上連続するイベント区間 + 終了後 5日間の回復期間を学習から除外する
_LONG_EVENT_THRESHOLD = 5
_LONG_EVENT_RECOVERY_DAYS = 5

# 本番予測バッチを成立させるための最低データ数。
# weekly_seasonality=True の NeuralProphet が学習を完了できる実用的な下限。
# 意図的に低めに設定し、データ蓄積初期でも予測バッチが稼働し続けるよう「継続性」を優先している。
# バックテスト評価用の下限 (backtest.py: _MIN_TRAIN_ROWS_NP=30) とは目的が異なる:
#   predict.py (14): 本番予測の継続性 — 14行未満でも予測不能にならないことを優先
#   backtest.py (30): 評価の安定性 — 複数の週次サイクルを確保し評価メトリクスの信頼性を担保
MIN_ROWS = 14


# ── 純粋ロジック層 ─────────────────────────────────────────────────────────────


def build_clean_series(
    df: pd.DataFrame,
    long_event_threshold: int = _LONG_EVENT_THRESHOLD,
    long_event_recovery_days: int = _LONG_EVENT_RECOVERY_DAYS,
) -> pd.DataFrame:
    """長期イベント区間を除いた学習用系列を返す。

    is_cheat_day / is_travel_day フラグが連続して long_event_threshold 日以上続く区間を
    「長期イベントブロック」とみなし、そのブロック本体 + 終了後 long_event_recovery_days 日間を
    学習対象から除外した DataFrame を返す。

    短期イベント (1〜long_event_threshold-1 日) は除外しない点が
    backtest.py の exclude_flagged_plus_recovery ポリシーと異なる。
    体重の長期的なトレンド学習への影響が小さい短期変動は除外しない方が
    データ量確保の観点から有利なため。

    Args:
        df: "ds" (datetime), "y" (float), 任意で "is_cheat_day" / "is_travel_day" (bool) を含む DataFrame。
        long_event_threshold: 長期イベントブロックとみなす最小連続日数。
        long_event_recovery_days: ブロック終了後の回復期間 (日数)。

    Returns:
        除外後の DataFrame ("ds", "y" 列のみ)。元の df は変更しない。
    """
    # フラグカラムが存在しない場合はそのまま返す (テスト用 / フラグ未取得環境への安全対策)
    if "is_cheat_day" not in df.columns and "is_travel_day" not in df.columns:
        return df[["ds", "y"]].copy()

    # イベント候補日を収集
    event_days: set[date] = set()
    if "is_cheat_day" in df.columns:
        for d in df.loc[df["is_cheat_day"] == True, "ds"].dt.date:  # noqa: E712
            event_days.add(d)
    if "is_travel_day" in df.columns:
        for d in df.loc[df["is_travel_day"] == True, "ds"].dt.date:  # noqa: E712
            event_days.add(d)

    if not event_days:
        return df[["ds", "y"]].copy()

    # 連続ブロックを検出
    sorted_days = sorted(event_days)
    blocks: list[tuple[date, date]] = []
    block_start = sorted_days[0]
    block_end = sorted_days[0]
    for d in sorted_days[1:]:
        if d == block_end + timedelta(days=1):
            block_end = d
        else:
            blocks.append((block_start, block_end))
            block_start = d
            block_end = d
    blocks.append((block_start, block_end))

    # 長期ブロック (>= threshold) のみ除外対象にする
    excluded: set[date] = set()
    long_block_count = 0
    for b_start, b_end in blocks:
        n_days = (b_end - b_start).days + 1
        if n_days < long_event_threshold:
            continue
        long_block_count += 1
        cur = b_start
        while cur <= b_end:
            excluded.add(cur)
            cur += timedelta(days=1)
        for i in range(1, long_event_recovery_days + 1):
            excluded.add(b_end + timedelta(days=i))

    if not excluded:
        return df[["ds", "y"]].copy()

    logger.info(
        "build_clean_series: %d long-event block(s) detected, excluding %d days from training.",
        long_block_count,
        len(excluded),
    )
    mask = ~df["ds"].dt.date.isin(excluded)
    return df.loc[mask, ["ds", "y"]].copy()


def patch_torch_load_for_neuralprophet(torch_module) -> bool:
    """torch 2.6+ の weights_only default 変更を NeuralProphet 用に補正する。

    Returns:
        patch を適用した場合 true。torch 2.5 以下では false。
    """
    if tuple(int(x) for x in torch_module.__version__.split(".")[:2]) < (2, 6):
        return False

    original_torch_load = torch_module.load

    def trusted_load(
        f,
        map_location=None,
        pickle_module=None,
        weights_only=None,
        mmap=None,
        **kw,
    ):
        return original_torch_load(
            f,
            map_location=map_location,
            pickle_module=pickle_module,
            weights_only=False,
            mmap=mmap,
            **kw,
        )

    torch_module.load = trusted_load
    return True


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
    patch_torch_load_for_neuralprophet(_torch)

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
    """Supabase から daily_logs を取得して予測用 DataFrame で返す。

    is_cheat_day / is_travel_day は長期イベント除外 (build_clean_series) のために取得する。
    """
    response = (
        client.table("daily_logs")
        .select("log_date,weight,is_cheat_day,is_travel_day")
        .order("log_date")
        .execute()
    )
    df = pd.DataFrame(response.data)
    if df.empty:
        return pd.DataFrame(columns=["ds", "y", "is_cheat_day", "is_travel_day"])
    df = df.dropna(subset=["weight"])
    df["ds"] = pd.to_datetime(df["log_date"])
    df["y"] = df["weight"].astype(float)
    return df[["ds", "y", "is_cheat_day", "is_travel_day"]]


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

    # 長期イベント区間を除外した学習用系列を構築する。
    # 実測系列 (df) はログ行数チェックに使い、モデルへは clean 系列のみ渡す。
    df_clean = build_clean_series(df)
    logger.info(
        "Training series: %d rows (raw=%d, excluded=%d).",
        len(df_clean),
        len(df),
        len(df) - len(df_clean),
    )

    if len(df_clean) < MIN_ROWS:
        logger.warning(
            "Insufficient clean data (%d rows after long-event exclusion). Skipping prediction.",
            len(df_clean),
        )
        return

    logger.info("Running NeuralProphet (rows=%d)...", len(df_clean))
    try:
        forecast = run_model(df_clean)
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
