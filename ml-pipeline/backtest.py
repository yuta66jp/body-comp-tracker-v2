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

評価軸 (--series-type):
  daily (デフォルト):
    各予測を target_date の単日実測体重と比較
  sma7:
    各予測を target_date 終端の 7 日間移動平均実測体重と比較
    ノイズ (水分変動 ±0.5〜1.5 kg) を除いた精度を評価できる
    [リークなし保証] horizon >= 7 のため SMA7 ウィンドウ
    [target_date-6, target_date] は常に origin より後になる

評価指標: MAE / RMSE / MAPE / bias / n_predictions

保存先:
  - forecast_backtest_runs        (実行メタ情報、config.series_type で識別)
  - forecast_backtest_metrics     (モデル/ホライズン別集計)
  - forecast_backtest_predictions (個別予測点)

実行:
  python ml-pipeline/backtest.py                          # 単日評価 (デフォルト)
  python ml-pipeline/backtest.py --series-type sma7       # 7日平均評価
  python ml-pipeline/backtest.py --max-origins 10         # 起点数を絞る
  python ml-pipeline/backtest.py --origin-step-days 14    # 起点間隔を広げる
  python ml-pipeline/backtest.py --horizons 7 14 30       # ホライズン指定
  python ml-pipeline/backtest.py --feature-set baseline   # 再現メタ (デフォルト)
"""

import argparse
import logging
import math
import os
import uuid
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Callable, Optional

import numpy as np
import pandas as pd

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
log = logging.getLogger(__name__)

# ── デフォルト定数 ──────────────────────────────────────────────────────────────
# CLI 引数未指定時のデフォルト値。実験時は CLI で上書きする。

_DEFAULT_HORIZONS       = [7, 14, 30]
_DEFAULT_MAX_ORIGINS    = 15   # 実行時間を抑えるための最大起点数 (直近優先)
_DEFAULT_ORIGIN_STEP    = 7    # 起点を何日おきにサンプリングするか
_DEFAULT_NP_EPOCHS      = 100  # 本番は 500。バックテストでは速度優先
_DEFAULT_FEATURE_SET    = "baseline"

# 内部固定値 (実験条件に依らず変えない)
_MIN_TRAIN_ROWS_NP         = 30   # NeuralProphet に必要な最低学習データ数
_MIN_TRAIN_ROWS_BASELINE   = 7    # ベースラインに必要な最低学習データ数
_SMA7_MIN_PERIODS          = 4    # SMA7 評価時に有効とみなすウィンドウ内の最低データ数
_MODEL_VERSION             = "neuralprophet-v1"

# 評価軸
SERIES_DAILY = "daily"
SERIES_SMA7  = "sma7"


# ── 実験 config ─────────────────────────────────────────────────────────────────

@dataclass
class BacktestConfig:
    """比較実験の全パラメータを一元管理する。

    CLI 引数 → BacktestConfig の変換は build_config() で行う。
    純粋ロジック関数はこの config のみを参照し、モジュール定数を直参照しない。

    フィールド:
      series_type      : 評価軸 ("daily" / "sma7")
      horizons         : 評価するホライズン日数リスト
      max_origins      : walk-forward の最大起点数 (直近優先)
      origin_step_days : 起点のサンプリング間隔 (日)
      np_epochs        : NeuralProphet のエポック数
      feature_set      : 使用特徴量セットの識別子 (再現メタ用; 現状は "baseline" のみ)

    内部定数 (変更不可):
      min_train_rows_np        : NP に必要な最低学習データ数
      min_train_rows_baseline  : ベースラインに必要な最低学習データ数
      sma7_min_periods         : SMA7 評価の最低有効データ数
    """
    series_type:      str       = SERIES_DAILY
    horizons:         list[int] = field(default_factory=lambda: list(_DEFAULT_HORIZONS))
    max_origins:      int       = _DEFAULT_MAX_ORIGINS
    origin_step_days: int       = _DEFAULT_ORIGIN_STEP
    np_epochs:        int       = _DEFAULT_NP_EPOCHS
    feature_set:      str       = _DEFAULT_FEATURE_SET

    # 内部固定値 (CLI 引数なし。変えるときはコードレビュー必須)
    min_train_rows_np:       int = _MIN_TRAIN_ROWS_NP
    min_train_rows_baseline: int = _MIN_TRAIN_ROWS_BASELINE
    sma7_min_periods:        int = _SMA7_MIN_PERIODS


def build_config(args: argparse.Namespace) -> BacktestConfig:
    """CLI 引数から BacktestConfig を構築する。"""
    return BacktestConfig(
        series_type=args.series_type,
        horizons=args.horizons,
        max_origins=args.max_origins,
        origin_step_days=args.origin_step_days,
        np_epochs=args.np_epochs,
        feature_set=args.feature_set,
    )


# ── Supabase クライアント (遅延 import) ─────────────────────────────────────────

def get_client():
    """Supabase クライアントを生成して返す。

    supabase は重い外部依存のため main() 内で遅延 import する。
    純粋ロジック層 (run_backtest 等) はこの関数を呼ばない。
    """
    from supabase import create_client  # noqa: PLC0415
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        log.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
        raise SystemExit(1)
    return create_client(url, key)


# ── データ取得 ─────────────────────────────────────────────────────────────────

def fetch_weight_history(sb) -> pd.DataFrame:
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


def make_neuralprophet_predictor(config: BacktestConfig) -> Callable:
    """config を閉じ込めた NeuralProphet 予測関数を返す。

    NeuralProphet の epoch 数は config.np_epochs から取得するため、
    CLI で --np-epochs を変えれば再学習コストを調整できる。
    """
    np_epochs = config.np_epochs
    _pytorch26_patched = False  # torch.load patch を一度だけ適用するためのフラグ

    def _predict(train: pd.DataFrame, horizon: int) -> Optional[float]:
        """NeuralProphet: 学習データで再訓練し horizon 日先を予測する。

        訓練失敗時は None を返し、その起点をスキップする。

        torch 2.6+ の weights_only=True デフォルト変更への対応:
          predict.py と同じ torch.load patch を適用する。
          このプロセス内で生成した checkpoint のみ読み込む (trusted) ため
          weights_only=False は安全。patch は初回呼び出し時に一度だけ適用する
          (複数起点で繰り返し呼ばれるため、二重 wrap による連鎖を防ぐ)。
        """
        nonlocal _pytorch26_patched
        try:
            import torch as _torch  # noqa: PLC0415
            from neuralprophet import NeuralProphet  # noqa: PLC0415

            # torch 2.6+ changed weights_only default to True, which breaks
            # NeuralProphet's checkpoint restore (Unsupported global:
            # neuralprophet.configure.ConfigSeasonality).
            # This pipeline only loads checkpoints it wrote itself (trusted),
            # so overriding weights_only=False is safe here.
            if not _pytorch26_patched and (
                tuple(int(x) for x in _torch.__version__.split(".")[:2]) >= (2, 6)
            ):
                _orig_load = _torch.load

                def _trusted_load(
                    f, map_location=None, pickle_module=None, weights_only=None,
                    mmap=None, **kw
                ):
                    return _orig_load(f, map_location=map_location, weights_only=False, **kw)

                _torch.load = _trusted_load
                _pytorch26_patched = True
                log.debug(
                    "PyTorch 2.6+ 互換 patch を適用 (backtest, weights_only=False)"
                )

            df_np = train[["log_date", "weight"]].rename(
                columns={"log_date": "ds", "weight": "y"}
            )
            m = NeuralProphet(
                n_lags=0,
                epochs=np_epochs,
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

    return _predict


def build_models(config: BacktestConfig) -> dict[str, Callable]:
    """config から実験で使うモデル辞書を構築する。

    NeuralProphet は config.np_epochs を閉じ込めたクロージャとして生成する。
    feature_set による特徴量切替はここで行う (現状は baseline のみ)。
    """
    return {
        "NeuralProphet":  make_neuralprophet_predictor(config),
        "Naive":          predict_naive,
        "MovingAverage7d": predict_ma7,
        "LinearTrend30d": predict_linear,
    }


# ── 起点選択 ───────────────────────────────────────────────────────────────────

def select_origins(df: pd.DataFrame, config: BacktestConfig) -> list[int]:
    """walk-forward の起点インデックスを選択する。

    条件:
      - 起点より前に config.min_train_rows_np 件以上のデータがある
      - 起点より後に max(config.horizons) 日以上のデータがある (実績値が存在するため)
      - config.origin_step_days おきにサンプリング
      - 直近 config.max_origins 件に絞る
    """
    max_h = max(config.horizons)
    valid_indices = [
        i for i in range(config.min_train_rows_np, len(df) - max_h)
    ]
    if not valid_indices:
        return []
    sampled = valid_indices[::config.origin_step_days]
    # 直近優先で max_origins 件に絞る
    if len(sampled) > config.max_origins:
        sampled = sampled[-config.max_origins:]
    return sampled


# ── SMA7 実測値計算 (リークなし) ───────────────────────────────────────────────

def compute_actual_sma7(
    df: pd.DataFrame,
    target_date: date,
    origin_date: date,
    min_periods: int = _SMA7_MIN_PERIODS,
) -> Optional[float]:
    """target_date 終端の 7 日間移動平均実測体重を返す。

    [リークなし保証]
    ウィンドウ = [target_date - 6, target_date]
    ただし origin_date 以前のデータは使用しない (防御的チェック)。

    horizon >= 7 であれば target_date の最小日付 = target_date - 6 >= origin_date + 1
    となるため訓練データとの重複は発生しない。

    有効なデータ点が min_periods 未満の場合は None を返す (計測欠損日が多い場合)。

    引数:
      df          : 全体重系列 (log_date, weight)
      target_date : ホライズン先の目標日
      origin_date : walk-forward 起点日 (訓練終端)
      min_periods : 7日ウィンドウ内で有効とみなす最低データ数
    """
    window_start = target_date - timedelta(days=6)
    # origin_date 以前を除外 (防御的)
    effective_start = max(window_start, origin_date + timedelta(days=1))
    mask = (
        (df["log_date"].dt.date >= effective_start)
        & (df["log_date"].dt.date <= target_date)
    )
    vals = df[mask]["weight"].dropna()
    if len(vals) < min_periods:
        return None
    return float(vals.mean())


# ── メトリクス計算 ─────────────────────────────────────────────────────────────

def compute_metrics(errors: list[float], actuals: list[float]) -> dict:
    """MAE / RMSE / MAPE / bias を計算する。

    errors  = [predicted - actual, ...]  (符号付き誤差)
    actuals = [実測体重, ...]

    MAPE は actual がすべて正の場合のみ計算する。
    """
    arr = np.array(errors, dtype=float)
    act = np.array(actuals, dtype=float)
    mae  = float(np.mean(np.abs(arr)))
    rmse = float(np.sqrt(np.mean(arr ** 2)))
    bias = float(np.mean(arr))   # 正 = 上振れ傾向, 負 = 下振れ傾向
    mape: Optional[float] = None
    if np.all(act > 0):
        mape = float(np.mean(np.abs(arr / act)) * 100)
    return {"mae": mae, "rmse": rmse, "mape": mape, "bias": bias}


# ── walk-forward バックテスト ─────────────────────────────────────────────────

# 結果型: {model_name: {horizon: [(error, actual, predicted, origin_date, target_date)]}}
BacktestResults = dict[str, dict[int, list[tuple[float, float, float, date, date]]]]


def run_backtest(df: pd.DataFrame, config: BacktestConfig) -> BacktestResults:
    """walk-forward バックテストを実行する。

    config.series_type:
      SERIES_DAILY: 各予測を target_date の単日実測体重と比較 (デフォルト)
      SERIES_SMA7:  各予測を target_date 終端の 7 日間移動平均実測体重と比較
                    ノイズに強い評価軸。horizon >= 7 のためリークは発生しない。

    モデル辞書は config から生成する (NeuralProphet の epochs も config 経由)。
    """
    models = build_models(config)
    origins = select_origins(df, config)

    if not origins:
        log.warning("有効な起点がありません。データ不足の可能性があります。")
        return {m: {h: [] for h in config.horizons} for m in models}

    log.info(
        "バックテスト開始: series_type=%s, feature_set=%s, 起点数=%d, horizons=%s",
        config.series_type, config.feature_set, len(origins), config.horizons,
    )

    results: BacktestResults = {m: {h: [] for h in config.horizons} for m in models}

    for origin_idx in origins:
        train = df.iloc[:origin_idx].copy()
        origin_date: date = train["log_date"].iloc[-1].date()
        log.info("  起点 %s (n_train=%d)", origin_date, len(train))

        for horizon in config.horizons:
            target_date = origin_date + timedelta(days=horizon)

            # ── 実測値の取得 ──
            if config.series_type == SERIES_SMA7:
                # 7日移動平均実測値 (リークなし)
                actual_val = compute_actual_sma7(
                    df, target_date, origin_date, config.sma7_min_periods
                )
                if actual_val is None:
                    log.debug(
                        "    SMA7実測値不足: %s (h=%d, min_periods=%d), スキップ",
                        target_date, horizon, config.sma7_min_periods,
                    )
                    continue
                actual = actual_val
            else:
                # 単日実測値 (既存ロジック)
                mask = df["log_date"].dt.date == target_date
                target_rows = df[mask]
                if target_rows.empty:
                    log.debug("    実測値なし: %s (h=%d), スキップ", target_date, horizon)
                    continue
                actual = float(target_rows["weight"].iloc[0])

            for model_name, predict_fn in models.items():
                min_rows = (
                    config.min_train_rows_np
                    if model_name == "NeuralProphet"
                    else config.min_train_rows_baseline
                )
                if len(train) < min_rows:
                    continue

                pred = predict_fn(train, horizon)
                if pred is None or not math.isfinite(pred):
                    continue

                error = pred - actual
                results[model_name][horizon].append(
                    (error, actual, pred, origin_date, target_date)
                )

    return results


# ── DB 保存 ────────────────────────────────────────────────────────────────────

def save_results(
    sb,
    df: pd.DataFrame,
    results: BacktestResults,
    config: BacktestConfig,
) -> str:
    """バックテスト結果を DB に保存し、run_id を返す。

    config の全パラメータを runs.config JSONB に記録することで、
    後から実験条件を再現・比較できる。
    feature_set / series_type (= target_type) も再現メタとして保存する。
    """
    run_id = str(uuid.uuid4())
    origins = select_origins(df, config)

    # 1. runs テーブルに実行メタ情報を挿入
    run_row = {
        "id":            run_id,
        "model_name":    "all",
        "model_version": _MODEL_VERSION,
        "horizons":      config.horizons,
        "train_min_date": df["log_date"].min().date().isoformat(),
        "train_max_date": df["log_date"].max().date().isoformat(),
        "n_source_rows": len(df),
        "notes": (
            f"Walk-forward backtest, series_type={config.series_type}, "
            f"feature_set={config.feature_set}, "
            f"origins={len(origins)}, "
            f"np_epochs={config.np_epochs}, "
            f"step={config.origin_step_days}d"
        ),
        # 再現メタ: この config を使えば同じ実験を再現できる
        "config": {
            "series_type":             config.series_type,
            "target_type":             config.series_type,   # 将来の比較軸向けエイリアス
            "feature_set":             config.feature_set,
            "horizons":                config.horizons,
            "max_origins":             config.max_origins,
            "origin_step_days":        config.origin_step_days,
            "np_epochs":               config.np_epochs,
            "min_train_rows_np":       config.min_train_rows_np,
            "min_train_rows_baseline": config.min_train_rows_baseline,
            "sma7_min_periods":        config.sma7_min_periods,
        },
    }
    sb.from_("forecast_backtest_runs").insert(run_row).execute()
    log.info("runs に挿入: run_id=%s, series_type=%s, feature_set=%s",
             run_id, config.series_type, config.feature_set)

    # 2. metrics テーブルに集計結果を挿入
    metric_rows = []
    pred_rows   = []

    for model_name, horizon_data in results.items():
        for horizon, records in horizon_data.items():
            if not records:
                log.warning(
                    "  %s h=%dd: 有効な予測なし (モデル失敗またはデータ不足)。スキップ。",
                    model_name, horizon,
                )
                continue

            errors       = [r[0] for r in records]
            actuals      = [r[1] for r in records]
            preds        = [r[2] for r in records]
            origins_list = [r[3] for r in records]
            targets      = [r[4] for r in records]

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
                    "predicted_weight":     round(pred,     3),
                    "actual_weight":        round(act,      3),
                    "error":                round(err,      3),
                    "abs_error":            round(abs(err), 3),
                    "squared_error":        round(err ** 2, 4),
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

def log_summary(results: BacktestResults, config: BacktestConfig) -> None:
    """評価結果のサマリーをログ出力する。"""
    models = list(results.keys())
    log.info(
        "=== バックテスト結果サマリー (series_type=%s, feature_set=%s) ===",
        config.series_type, config.feature_set,
    )
    for model_name in models:
        for horizon in config.horizons:
            records = results[model_name].get(horizon, [])
            if not records:
                log.info("  %-20s h=%2dd  有効な予測なし (モデル失敗またはデータ不足)", model_name, horizon)
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
    parser = argparse.ArgumentParser(
        description="体重予測モデルの walk-forward バックテスト"
    )
    parser.add_argument(
        "--series-type",
        choices=[SERIES_DAILY, SERIES_SMA7],
        default=SERIES_DAILY,
        dest="series_type",
        help=(
            "評価軸: "
            f"{SERIES_DAILY}=単日体重 (デフォルト), "
            f"{SERIES_SMA7}=7日移動平均体重 (ノイズに強い評価)"
        ),
    )
    parser.add_argument(
        "--horizons",
        nargs="+",
        type=int,
        default=list(_DEFAULT_HORIZONS),
        metavar="DAYS",
        help=f"評価ホライズン (日数、スペース区切り複数可)。デフォルト: {_DEFAULT_HORIZONS}",
    )
    parser.add_argument(
        "--max-origins",
        type=int,
        default=_DEFAULT_MAX_ORIGINS,
        dest="max_origins",
        help=f"walk-forward の最大起点数 (直近優先)。デフォルト: {_DEFAULT_MAX_ORIGINS}",
    )
    parser.add_argument(
        "--origin-step-days",
        type=int,
        default=_DEFAULT_ORIGIN_STEP,
        dest="origin_step_days",
        help=f"起点のサンプリング間隔 (日)。デフォルト: {_DEFAULT_ORIGIN_STEP}",
    )
    parser.add_argument(
        "--np-epochs",
        type=int,
        default=_DEFAULT_NP_EPOCHS,
        dest="np_epochs",
        help=f"NeuralProphet のエポック数。デフォルト: {_DEFAULT_NP_EPOCHS}",
    )
    parser.add_argument(
        "--feature-set",
        default=_DEFAULT_FEATURE_SET,
        dest="feature_set",
        help=(
            "使用する特徴量セットの識別子 (再現メタとして保存)。"
            f"デフォルト: {_DEFAULT_FEATURE_SET}。"
            "将来の比較実験例: baseline / conditions / conditions_legs"
        ),
    )
    args = parser.parse_args()

    config = build_config(args)
    log.info(
        "実験 config: series_type=%s, feature_set=%s, horizons=%s, "
        "max_origins=%d, origin_step_days=%d, np_epochs=%d",
        config.series_type, config.feature_set, config.horizons,
        config.max_origins, config.origin_step_days, config.np_epochs,
    )

    # supabase は実行系でのみ使用する (純粋ロジック層に依存を持ち込まない)
    sb = get_client()

    log.info("体重履歴を取得中...")
    df = fetch_weight_history(sb)

    min_required = config.min_train_rows_np + max(config.horizons)
    if len(df) < min_required:
        log.warning(
            "バックテストに必要なデータが不足しています "
            "(有=%d 件, 必要最低=%d 件)。スキップします。",
            len(df), min_required,
        )
        return

    results = run_backtest(df, config)
    log_summary(results, config)

    run_id = save_results(sb, df, results, config)
    log.info(
        "バックテスト完了。run_id=%s, series_type=%s, feature_set=%s",
        run_id, config.series_type, config.feature_set,
    )


if __name__ == "__main__":
    main()
