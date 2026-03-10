"""
backtest.py — 体重予測モデルの walk-forward 精度評価

評価対象モデル:
  - NeuralProphet  (現行の本番モデル)
  - Naive          (直近体重をそのまま将来値とする)
  - MovingAverage7d (直近7日平均)
  - LinearTrend30d  (直近30日の単純線形回帰で外挿)

評価方式: rolling walk-forward backtest
  - 起点をずらしながら「その時点までのデータだけ」で予測
  - 未来情報リークなし
  - 各起点 × 各ホライズン × 各モデルで誤差を記録

評価指標: MAE / RMSE / MAPE / bias / n_predictions

保存先:
  - forecast_backtest_runs        (実行メタ情報)
  - forecast_backtest_metrics     (モデル/ホライズン別集計)
  - forecast_backtest_predictions (個別予測点)

実行:
  python ml-pipeline/backtest.py
"""

import logging
import math
import os
import uuid
from datetime import date, timedelta
from typing import Optional

import numpy as np
import pandas as pd
from supabase import create_client, Client

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
log = logging.getLogger(__name__)

# ── 設定 ───────────────────────────────────────────────────────────────────────

HORIZONS = [7, 14, 30]

# walk-forward の起点サンプリング設定
MIN_TRAIN_ROWS_NP = 30        # NeuralProphet に必要な最低学習データ数
MIN_TRAIN_ROWS_BASELINE = 7   # ベースラインに必要な最低学習データ数
MAX_ORIGINS = 15              # 実行時間を抑えるための最大起点数 (直近優先)
ORIGIN_STEP_DAYS = 7          # 起点を何日おきにサンプリングするか

# NeuralProphet の設定 (backtest 用に epoch 数を抑える)
NP_EPOCHS_BACKTEST = 100      # 本番は 500。バックテストでは速度優先
MODEL_VERSION = "neuralprophet-v1"


# ── Supabase クライアント ──────────────────────────────────────────────────────

def get_client() -> Client:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        log.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
        raise SystemExit(1)
    return create_client(url, key)


# ── データ取得 ─────────────────────────────────────────────────────────────────

def fetch_weight_history(sb: Client) -> pd.DataFrame:
    """daily_logs から weight が存在するレコードを日付昇順で取得する。"""
    resp = sb.from_("daily_logs").select("log_date,weight").order("log_date").execute()
    df = pd.DataFrame(resp.data)
    if df.empty:
        log.warning("daily_logs に重量データがありません")
        return df
    df = df.dropna(subset=["weight"])
    df["log_date"] = pd.to_datetime(df["log_date"])
    df = df.sort_values("log_date").reset_index(drop=True)
    log.info(
        "体重データ取得: %d 件 (%s → %s)",
        len(df),
        df["log_date"].iloc[0].date(),
        df["log_date"].iloc[-1].date(),
    )
    return df


# ── ベースライン予測器 ─────────────────────────────────────────────────────────

def predict_naive(train: pd.DataFrame, horizon: int) -> float:
    """Naive: 直近体重をホライズン全期間に適用する。"""
    _ = horizon  # unused; held constant
    return float(train["weight"].iloc[-1])


def predict_ma7(train: pd.DataFrame, horizon: int) -> float:
    """Moving Average 7d: 直近7日平均を将来値とする。"""
    _ = horizon
    return float(train["weight"].tail(7).mean())


def predict_linear(train: pd.DataFrame, horizon: int) -> float:
    """Linear Trend 30d: 直近30日の単純線形回帰で horizon 日先を外挿する。"""
    window = train.tail(30)
    x = np.arange(len(window), dtype=float)
    y = window["weight"].values.astype(float)
    if len(x) < 2:
        return float(y[-1])
    slope, intercept = np.polyfit(x, y, 1)
    # horizon 日先のインデックス = 最後のインデックス + horizon
    return float(slope * (len(window) - 1 + horizon) + intercept)


def predict_neuralprophet(train: pd.DataFrame, horizon: int) -> Optional[float]:
    """NeuralProphet: 学習データで再訓練し horizon 日先を予測する。

    訓練失敗時は None を返し、その起点をスキップする。
    epoch 数はバックテスト用に NP_EPOCHS_BACKTEST に抑えている。
    """
    try:
        from neuralprophet import NeuralProphet  # noqa: PLC0415

        df_np = train[["log_date", "weight"]].rename(
            columns={"log_date": "ds", "weight": "y"}
        )
        m = NeuralProphet(
            n_lags=0,
            epochs=NP_EPOCHS_BACKTEST,
            weekly_seasonality=True,
            daily_seasonality=False,
            yearly_seasonality=False,
        )
        m.fit(df_np, freq="D", progress="none")
        future = m.make_future_dataframe(df_np, periods=horizon, n_historic_predictions=0)
        forecast = m.predict(future)
        return float(forecast["yhat1"].iloc[-1])
    except Exception as exc:
        log.warning("NeuralProphet 予測失敗 (horizon=%d): %s", horizon, exc)
        return None


# ── モデルレジストリ ───────────────────────────────────────────────────────────

MODELS: dict[str, object] = {
    "NeuralProphet": predict_neuralprophet,
    "Naive": predict_naive,
    "MovingAverage7d": predict_ma7,
    "LinearTrend30d": predict_linear,
}


# ── 起点選択 ───────────────────────────────────────────────────────────────────

def select_origins(df: pd.DataFrame) -> list[int]:
    """walk-forward の起点インデックスを選択する。

    条件:
      - 起点より前に MIN_TRAIN_ROWS_NP 件以上のデータがある
      - 起点より後に max(HORIZONS) 日以上のデータがある (実績値が存在するため)
      - ORIGIN_STEP_DAYS おきにサンプリング
      - 直近 MAX_ORIGINS 件に絞る
    """
    max_h = max(HORIZONS)
    valid_indices = [
        i for i in range(MIN_TRAIN_ROWS_NP, len(df) - max_h)
    ]
    if not valid_indices:
        return []
    sampled = valid_indices[::ORIGIN_STEP_DAYS]
    # 直近優先で MAX_ORIGINS 件に絞る
    if len(sampled) > MAX_ORIGINS:
        sampled = sampled[-MAX_ORIGINS:]
    return sampled


# ── メトリクス計算 ─────────────────────────────────────────────────────────────

def compute_metrics(errors: list[float], actuals: list[float]) -> dict:
    """MAE / RMSE / MAPE / bias を計算する。

    errors  = [predicted - actual, ...]  (符号付き誤差)
    actuals = [実測体重, ...]

    MAPE は actual がすべて正の場合のみ計算する。
    """
    arr = np.array(errors, dtype=float)
    act = np.array(actuals, dtype=float)
    mae = float(np.mean(np.abs(arr)))
    rmse = float(np.sqrt(np.mean(arr ** 2)))
    bias = float(np.mean(arr))   # 正 = 上振れ傾向, 負 = 下振れ傾向
    mape: Optional[float] = None
    if np.all(act > 0):
        mape = float(np.mean(np.abs(arr / act)) * 100)
    return {"mae": mae, "rmse": rmse, "mape": mape, "bias": bias}


# ── walk-forward バックテスト ─────────────────────────────────────────────────

# 結果型: {model_name: {horizon: [(error, actual, predicted, origin_date, target_date)]}}
BacktestResults = dict[str, dict[int, list[tuple[float, float, float, date, date]]]]


def run_backtest(df: pd.DataFrame) -> BacktestResults:
    """walk-forward バックテストを実行する。"""
    origins = select_origins(df)
    if not origins:
        log.warning("有効な起点がありません。データ不足の可能性があります。")
        return {m: {h: [] for h in HORIZONS} for m in MODELS}

    log.info("バックテスト開始: 起点数=%d, horizons=%s", len(origins), HORIZONS)

    results: BacktestResults = {m: {h: [] for h in HORIZONS} for m in MODELS}

    for origin_idx in origins:
        train = df.iloc[:origin_idx].copy()
        origin_date: date = train["log_date"].iloc[-1].date()
        log.info("  起点 %s (n_train=%d)", origin_date, len(train))

        for horizon in HORIZONS:
            target_date = origin_date + timedelta(days=horizon)

            # target_date の実測値を探す
            mask = df["log_date"].dt.date == target_date
            target_rows = df[mask]
            if target_rows.empty:
                log.debug("    実測値なし: %s (h=%d), スキップ", target_date, horizon)
                continue
            actual = float(target_rows["weight"].iloc[0])

            for model_name, predict_fn in MODELS.items():
                min_rows = MIN_TRAIN_ROWS_NP if model_name == "NeuralProphet" else MIN_TRAIN_ROWS_BASELINE
                if len(train) < min_rows:
                    continue

                pred = predict_fn(train, horizon)  # type: ignore[operator]
                if pred is None or not math.isfinite(pred):
                    continue

                error = pred - actual
                results[model_name][horizon].append(
                    (error, actual, pred, origin_date, target_date)
                )

    return results


# ── DB 保存 ────────────────────────────────────────────────────────────────────

def save_results(sb: Client, df: pd.DataFrame, results: BacktestResults) -> str:
    """バックテスト結果を DB に保存し、run_id を返す。"""
    run_id = str(uuid.uuid4())
    origins = select_origins(df)

    # 1. runs テーブルに実行メタ情報を挿入
    run_row = {
        "id": run_id,
        "model_name": "all",
        "model_version": MODEL_VERSION,
        "horizons": HORIZONS,
        "train_min_date": df["log_date"].min().date().isoformat(),
        "train_max_date": df["log_date"].max().date().isoformat(),
        "n_source_rows": len(df),
        "notes": (
            f"Walk-forward backtest, origins={len(origins)}, "
            f"np_epochs={NP_EPOCHS_BACKTEST}, "
            f"step={ORIGIN_STEP_DAYS}d"
        ),
        "config": {
            "horizons": HORIZONS,
            "max_origins": MAX_ORIGINS,
            "origin_step_days": ORIGIN_STEP_DAYS,
            "np_epochs_backtest": NP_EPOCHS_BACKTEST,
            "min_train_rows_np": MIN_TRAIN_ROWS_NP,
            "min_train_rows_baseline": MIN_TRAIN_ROWS_BASELINE,
        },
    }
    sb.from_("forecast_backtest_runs").insert(run_row).execute()
    log.info("runs に挿入: run_id=%s", run_id)

    # 2. metrics テーブルに集計結果を挿入
    metric_rows = []
    pred_rows = []

    for model_name, horizon_data in results.items():
        for horizon, records in horizon_data.items():
            if not records:
                log.warning(
                    "  %s h=%dd: 有効な予測なし。データ不足の可能性。スキップ。",
                    model_name, horizon,
                )
                continue

            errors  = [r[0] for r in records]
            actuals = [r[1] for r in records]
            preds   = [r[2] for r in records]
            origins_list = [r[3] for r in records]
            targets = [r[4] for r in records]

            m = compute_metrics(errors, actuals)

            metric_rows.append({
                "run_id":        run_id,
                "model_name":    model_name,
                "horizon_days":  horizon,
                "mae":           round(m["mae"],  4),
                "rmse":          round(m["rmse"], 4),
                "mape":          round(m["mape"], 4) if m["mape"] is not None else None,
                "bias":          round(m["bias"], 4),
                "n_predictions": len(records),
                "extra":         {},
            })

            # 個別予測点の記録
            for err, act, pred, orig, tgt in zip(
                errors, actuals, preds, origins_list, targets
            ):
                ape = abs(err / act) * 100 if act > 0 else None
                pred_rows.append({
                    "run_id":               run_id,
                    "model_name":           model_name,
                    "forecast_origin_date": orig.isoformat(),
                    "target_date":          tgt.isoformat(),
                    "horizon_days":         horizon,
                    "predicted_weight":     round(pred,       3),
                    "actual_weight":        round(act,        3),
                    "error":                round(err,        3),
                    "abs_error":            round(abs(err),   3),
                    "squared_error":        round(err ** 2,   4),
                    "ape":                  round(ape, 4) if ape is not None else None,
                })

    if metric_rows:
        sb.from_("forecast_backtest_metrics").insert(metric_rows).execute()
        log.info("metrics に挿入: %d 件", len(metric_rows))

    if pred_rows:
        # バッチ挿入 (リクエストサイズ制限を回避)
        batch_size = 100
        for i in range(0, len(pred_rows), batch_size):
            sb.from_("forecast_backtest_predictions").insert(
                pred_rows[i : i + batch_size]
            ).execute()
        log.info("predictions に挿入: %d 件", len(pred_rows))

    return run_id


# ── サマリーログ ───────────────────────────────────────────────────────────────

def log_summary(results: BacktestResults) -> None:
    """評価結果のサマリーをログ出力する。"""
    log.info("=== バックテスト結果サマリー ===")
    for model_name in MODELS:
        for horizon in HORIZONS:
            records = results[model_name][horizon]
            if not records:
                log.info("  %-20s h=%2dd  データ不足のためスキップ", model_name, horizon)
                continue
            errors  = [r[0] for r in records]
            actuals = [r[1] for r in records]
            m = compute_metrics(errors, actuals)
            mape_str = f"{m['mape']:.2f}%" if m["mape"] is not None else "N/A"
            log.info(
                "  %-20s h=%2dd  MAE=%.3f  RMSE=%.3f  MAPE=%s  bias=%.3f  n=%d",
                model_name, horizon,
                m["mae"], m["rmse"], mape_str, m["bias"], len(records),
            )


# ── メイン ─────────────────────────────────────────────────────────────────────

def main() -> None:
    sb = get_client()

    log.info("体重履歴を取得中...")
    df = fetch_weight_history(sb)

    min_required = MIN_TRAIN_ROWS_NP + max(HORIZONS)
    if len(df) < min_required:
        log.warning(
            "バックテストに必要なデータが不足しています "
            "(有=%d 件, 必要最低=%d 件)。スキップします。",
            len(df), min_required,
        )
        return

    results = run_backtest(df)
    log_summary(results)

    run_id = save_results(sb, df, results)
    log.info("バックテスト完了。run_id=%s", run_id)


if __name__ == "__main__":
    main()
