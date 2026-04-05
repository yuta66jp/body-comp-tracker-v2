"""
backtest.py — 体重予測モデルの walk-forward 精度評価

評価対象モデル:
  - NeuralProphet   (現行の本番モデル)
  - Naive           (直近体重をそのまま将来値とする)
  - MovingAverage7d (直近7日平均)
  - LinearTrend30d  (直近30日の単純線形回帰で外挿)
  - EWLinearTrend   (直近30日の指数加重線形回帰で外挿; 最近の変化に敏感)

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

評価ポリシー (--eval-policies):
  all_days:
    全予測点を評価対象にする (従来動作)
  exclude_flagged_plus_recovery:
    is_cheat_day / is_travel_day が True の日と、その後 recovery_days 日間を除外する
    手動 event period が指定されている場合は、その期間と recovery_days 日間も除外する
    チートデイや旅行による短期体重ブレを除いた通常日の精度を評価できる
  exclude_long_event_blocks:
    連続 long_event_threshold 日以上のイベント区間 (長期イベントブロック) のみを除外する
    ブロック本体 + ブロック終了後 long_event_recovery_days 日間を除外する
    長期イベント区間が精度劣化要因かを単独で検証できる (#480)
    仮説値: long_event_threshold=5, long_event_recovery_days=5 (将来 CLI で変更可)

  同一 run に対して複数 policy の metrics を算出し、DB に保存する。
  (#364 で比較表示に利用する)

保存先:
  - forecast_backtest_runs        (実行メタ情報、config.series_type で識別)
  - forecast_backtest_metrics     (モデル/ホライズン/eval_policy 別集計)
  - forecast_backtest_predictions (個別予測点)

実行:
  python ml-pipeline/backtest.py                          # 単日評価 (デフォルト)
  python ml-pipeline/backtest.py --series-type sma7       # 7日平均評価
  python ml-pipeline/backtest.py --max-origins 10         # 起点数を絞る
  python ml-pipeline/backtest.py --origin-step-days 14    # 起点間隔を広げる
  python ml-pipeline/backtest.py --horizons 7 14 30       # ホライズン指定
  python ml-pipeline/backtest.py --feature-set baseline   # 再現メタ (デフォルト)
  python ml-pipeline/backtest.py --recovery-days 3        # 回復期間を変更 (デフォルト: 2)
  python ml-pipeline/backtest.py --event-periods 2026-03-01:2026-03-10  # 手動イベント期間
  python ml-pipeline/backtest.py --eval-policies all_days exclude_flagged_plus_recovery exclude_long_event_blocks
  python ml-pipeline/backtest.py --long-event-threshold 7 --long-event-recovery-days 3  # 長期イベント閾値変更
"""

import argparse
import logging
import math
import os
import uuid
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Callable, Optional, Sequence

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
# NeuralProphet バックテスト時の最低訓練データ数。
# predict.py の MIN_ROWS=14 より高く設定しているのは意図的:
#   predict.py (14): 本番予測の継続性を優先。データ蓄積初期でも予測バッチが稼働できる下限。
#   backtest.py (30): 評価の安定性を優先。14行では週次季節性が約2周しか確保できず
#                     評価メトリクスが不安定になる。30行 ≈ 4週以上のデータで
#                     複数の週次パターンをカバーし、評価品質を担保する。
_MIN_TRAIN_ROWS_NP         = 30
_MIN_TRAIN_ROWS_BASELINE   = 7    # ベースラインに必要な最低学習データ数
_SMA7_MIN_PERIODS          = 4    # SMA7 評価時に有効とみなすウィンドウ内の最低データ数
_MODEL_VERSION             = "neuralprophet-v1"

# 評価軸
SERIES_DAILY = "daily"
SERIES_SMA7  = "sma7"

# ── 評価ポリシー ─────────────────────────────────────────────────────────────────

# 全予測点を評価対象にする (従来動作・比較ベースライン)
POLICY_ALL_DAYS = "all_days"

# チートデイ / 旅行日と回復期間を除外した通常日のみ評価する
# 手動 event period も優先適用して除外する
POLICY_EXCLUDE_FLAGGED_PLUS_RECOVERY = "exclude_flagged_plus_recovery"

# 連続 long_event_threshold 日以上の長期イベント区間のみを除外する (#480)
# ブロック本体 + ブロック終了後 long_event_recovery_days 日間を除外する
# 短期イベント (1〜4日) は除外せず、長期連続区間の影響のみを評価できる
POLICY_EXCLUDE_LONG_EVENT_BLOCKS = "exclude_long_event_blocks"

_DEFAULT_EVAL_POLICIES = [
    POLICY_ALL_DAYS,
    POLICY_EXCLUDE_FLAGGED_PLUS_RECOVERY,
    POLICY_EXCLUDE_LONG_EVENT_BLOCKS,
]

# イベント後の回復期間 (日数)。デフォルト 2 日:
#   チートデイの翌日〜翌々日は水分変動が残りやすいため除外する。
#   旅行も同様。イベント種別ごとの自動調整はこの Issue のスコープ外 (#363)。
_DEFAULT_RECOVERY_DAYS = 2

# 長期イベントブロック判定閾値 (#480 初期仮説値)
# 連続イベント日数がこの値以上のブロックを「長期イベントブロック」とみなす。
# 将来のチューニングに備えて定数化。CLI --long-event-threshold で変更可能。
_DEFAULT_LONG_EVENT_THRESHOLD = 5

# 長期イベントブロック終了後の回復期間 (日数) (#480 初期仮説値)
# 長期区間後は水分・コンディション回復に時間がかかる想定で長めに設定。
# CLI --long-event-recovery-days で変更可能。
_DEFAULT_LONG_EVENT_RECOVERY_DAYS = 5


# ── 手動 event period ──────────────────────────────────────────────────────────

@dataclass
class ManualEventPeriod:
    """手動で指定するイベント期間 (旅行・遠征など長期逸脱)。

    exclude_flagged_plus_recovery ポリシーでは、この期間と
    end_date の後 recovery_days 日間を除外対象に加える。

    daily_logs の is_cheat_day / is_travel_day フラグで捕捉できない稀な
    長期逸脱を手動で指定するためのもの。
    標準的なチートデイや短期旅行は DB フラグ側で管理する。

    フィールド:
      start_date : イベント開始日 (含む)
      end_date   : イベント終了日 (含む)。start_date <= end_date であること。
      reason     : イベント内容メモ (任意)。run.config に記録され除外日一覧で確認できる。
                   例: "遠征", "海外旅行", "チートウィーク"
    """
    start_date: date
    end_date: date
    reason: str = ""


def parse_event_period(s: str) -> ManualEventPeriod:
    """'YYYY-MM-DD:YYYY-MM-DD' または 'YYYY-MM-DD:YYYY-MM-DD:REASON' 形式の文字列を
    ManualEventPeriod に変換する。

    CLI の --event-periods 引数パーサとして使用する。
    REASON は省略可能。空白はアンダースコアで代替するとシェル展開の問題を避けられる。
    REASON にコロンを含めることはできない。
    """
    parts = s.split(":", 2)  # 最大 2 分割 → ["START", "END"] or ["START", "END", "REASON"]
    if len(parts) < 2:
        raise argparse.ArgumentTypeError(
            f"イベント期間は 'START:END' または 'START:END:REASON' 形式で指定してください "
            f"(例: 2026-03-01:2026-03-10). 受け取った値: {s!r}"
        )
    try:
        start = date.fromisoformat(parts[0].strip())
        end   = date.fromisoformat(parts[1].strip())
    except ValueError as exc:
        raise argparse.ArgumentTypeError(
            f"日付を ISO 形式 (YYYY-MM-DD) で指定してください: {exc}"
        ) from exc
    if start > end:
        raise argparse.ArgumentTypeError(
            f"start_date ({start}) は end_date ({end}) 以前である必要があります"
        )
    reason = parts[2].strip() if len(parts) > 2 else ""
    return ManualEventPeriod(start_date=start, end_date=end, reason=reason)


# ── 実験 config ─────────────────────────────────────────────────────────────────

@dataclass
class BacktestConfig:
    """比較実験の全パラメータを一元管理する。

    CLI 引数 → BacktestConfig の変換は build_config() で行う。
    純粋ロジック関数はこの config のみを参照し、モジュール定数を直参照しない。

    フィールド:
      series_type           : 評価軸 ("daily" / "sma7")
      horizons              : 評価するホライズン日数リスト
      max_origins           : walk-forward の最大起点数 (直近優先)
      origin_step_days      : 起点のサンプリング間隔 (日)
      np_epochs             : NeuralProphet のエポック数
      feature_set           : 使用特徴量セットの識別子 (再現メタ用; 現状は "baseline" のみ)
      eval_policies         : 算出する評価ポリシーのリスト
      recovery_days         : イベント日後の回復除外期間 (日数)
      manual_event_periods  : 手動指定のイベント期間リスト (長期逸脱を DB フラグ外で除外)

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

    # 評価ポリシー設定
    eval_policies:        list[str]              = field(default_factory=lambda: list(_DEFAULT_EVAL_POLICIES))
    recovery_days:        int                    = _DEFAULT_RECOVERY_DAYS
    manual_event_periods: list[ManualEventPeriod] = field(default_factory=list)

    # 長期イベントブロック除外ポリシー用パラメータ (#480 初期仮説値)
    long_event_threshold:      int = _DEFAULT_LONG_EVENT_THRESHOLD
    long_event_recovery_days:  int = _DEFAULT_LONG_EVENT_RECOVERY_DAYS

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
        eval_policies=args.eval_policies,
        recovery_days=args.recovery_days,
        manual_event_periods=args.event_periods,
        long_event_threshold=args.long_event_threshold,
        long_event_recovery_days=args.long_event_recovery_days,
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
    """daily_logs から weight が存在するレコードを日付昇順で取得する。

    is_cheat_day / is_travel_day は evaluation policy の除外マスク生成に使用する。
    どちらも BOOLEAN NOT NULL DEFAULT FALSE のため NULL にはならない。
    """
    resp = (
        sb.from_("daily_logs")
        .select("log_date,weight,is_cheat_day,is_travel_day")
        .order("log_date")
        .execute()
    )
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


def predict_ew_linear(train: pd.DataFrame, horizon: int) -> float:
    """EW Linear Trend: SMA7 平滑化系列に指数加重線形回帰を適用し horizon 日先を外挿する。

    入力の平滑化:
      train["weight"] 全体に 7日移動平均 (min_periods=4) を適用した SMA7 系列を作り、
      その直近30件に対して指数加重線形回帰を行う。
      - 単日体重ノイズ (水分変動 ±0.5〜1.5 kg) を吸収
      - 直近のトレンド変化には追随 (alpha=0.9 の指数加重で最近を重視)

    LinearTrend30d との違い:
      - 入力が生体重 → SMA7 平滑化体重 (ノイズ抑制)
      - 等重み最小二乗 → 指数加重最小二乗 (直近を重視)

    alpha=0.9 の選択根拠:
      - 1日前の重みが 0.9、7日前は ~0.48、30日前は ~0.04
      - 短期トレンドと中期トレンドのバランスを取る実用的な値

    フォールバック:
      SMA7 有効データが 2 件未満の場合は生体重の最終値を返す (データ不足初期)。
    """
    # SMA7 を訓練データ全体で計算し、有効値の直近30件を取る
    # (window 先頭で計算した SMA7 は精度が低いため全体での計算が正確)
    sma7 = train["weight"].rolling(7, min_periods=4).mean()
    sma7_vals = sma7.dropna().tail(30).values.astype(float)

    n = len(sma7_vals)
    if n < 2:
        return float(train["weight"].iloc[-1])

    x = np.arange(n, dtype=float)

    # 指数加重: 直近ほど重い (最新 = alpha^0 = 1.0, 1日前 = 0.9, ...)
    alpha = 0.9
    weights = np.array([alpha ** (n - 1 - i) for i in range(n)])

    # 加重線形回帰 (numpy polyfit は w パラメータで重みをサポート)
    slope, intercept = np.polyfit(x, sma7_vals, 1, w=weights)

    # horizon 日先のインデックス = 最後のインデックス + horizon
    return float(slope * (n - 1 + horizon) + intercept)


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
        "EWLinearTrend":  predict_ew_linear,
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


# ── 評価ポリシー: 除外日集合の構築 ──────────────────────────────────────────────

def build_exclusion_dates(
    df: pd.DataFrame,
    recovery_days: int,
    manual_event_periods: Sequence[ManualEventPeriod],
) -> set[date]:
    """評価から除外する日付の集合を構築する。

    除外対象:
      1. df に is_cheat_day=True の行がある日 + 後続 recovery_days 日間
      2. df に is_travel_day=True の行がある日 + 後続 recovery_days 日間
      3. manual_event_periods の各期間内の全日 + end_date 後 recovery_days 日間

    is_cheat_day / is_travel_day カラムが df に存在しない場合はスキップする
    (テスト用 DataFrame など、フラグカラムがない場合の安全対策)。

    引数:
      df                   : 体重履歴 DataFrame (log_date, weight[, is_cheat_day, is_travel_day])
      recovery_days        : イベント日後の回復期間 (日数)
      manual_event_periods : 手動指定のイベント期間リスト

    戻り値:
      除外対象の日付の集合 (set[date])
    """
    excluded: set[date] = set()

    def _add_with_recovery(event_date: date) -> None:
        """event_date 当日と後続 recovery_days 日間を除外集合に追加する。"""
        for i in range(recovery_days + 1):
            excluded.add(event_date + timedelta(days=i))

    # 1. DB フラグ由来の除外: is_cheat_day
    if "is_cheat_day" in df.columns:
        for d in df.loc[df["is_cheat_day"] == True, "log_date"].dt.date:
            _add_with_recovery(d)

    # 2. DB フラグ由来の除外: is_travel_day
    if "is_travel_day" in df.columns:
        for d in df.loc[df["is_travel_day"] == True, "log_date"].dt.date:
            _add_with_recovery(d)

    # 3. 手動 event period 由来の除外 (DB フラグで捕捉できない長期逸脱)
    for ep in manual_event_periods:
        cur = ep.start_date
        while cur <= ep.end_date:
            excluded.add(cur)
            cur += timedelta(days=1)
        # end_date の後 recovery_days 日間も除外
        for i in range(1, recovery_days + 1):
            excluded.add(ep.end_date + timedelta(days=i))

    return excluded


def build_long_event_exclusion_dates(
    df: pd.DataFrame,
    long_event_threshold: int,
    long_event_recovery_days: int,
    manual_event_periods: Sequence[ManualEventPeriod],
) -> set[date]:
    """長期イベント区間 (連続 long_event_threshold 日以上のイベントブロック) のみを除外する。

    イベント候補日:
      1. df に is_cheat_day=True の行がある日
      2. df に is_travel_day=True の行がある日
      3. manual_event_periods の各期間内の全日

    これらのイベント候補日を合算し、連続する区間 (連続日数 >= long_event_threshold) を
    「長期イベントブロック」として検出する。
    ブロック本体全日 + ブロック終了日後 long_event_recovery_days 日間を除外する。

    短期イベント (1〜long_event_threshold-1 日) は除外しない点が
    exclude_flagged_plus_recovery と異なる。

    引数:
      df                       : 体重履歴 DataFrame (log_date[, is_cheat_day, is_travel_day])
      long_event_threshold     : 長期イベントブロックとみなす最小連続日数 (初期仮説値: 5)
      long_event_recovery_days : ブロック終了後の回復期間 (日数) (初期仮説値: 5)
      manual_event_periods     : 手動指定のイベント期間リスト

    戻り値:
      除外対象の日付の集合 (set[date])
    """
    # イベント候補日を収集 (重複日はセットで自然に除外)
    event_days: set[date] = set()

    if "is_cheat_day" in df.columns:
        for d in df.loc[df["is_cheat_day"] == True, "log_date"].dt.date:  # noqa: E712
            event_days.add(d)

    if "is_travel_day" in df.columns:
        for d in df.loc[df["is_travel_day"] == True, "log_date"].dt.date:  # noqa: E712
            event_days.add(d)

    for ep in manual_event_periods:
        cur = ep.start_date
        while cur <= ep.end_date:
            event_days.add(cur)
            cur += timedelta(days=1)

    if not event_days:
        return set()

    # 連続ブロックを検出
    sorted_days = sorted(event_days)
    blocks: list[tuple[date, date]] = []  # (block_start, block_end)
    block_start = sorted_days[0]
    block_end   = sorted_days[0]

    for d in sorted_days[1:]:
        if d == block_end + timedelta(days=1):
            block_end = d
        else:
            blocks.append((block_start, block_end))
            block_start = d
            block_end   = d
    blocks.append((block_start, block_end))

    # 長期ブロック (>=threshold) のみ除外対象にする
    excluded: set[date] = set()
    for (b_start, b_end) in blocks:
        n_days = (b_end - b_start).days + 1
        if n_days < long_event_threshold:
            continue  # 短期イベントはスキップ
        # ブロック本体
        cur = b_start
        while cur <= b_end:
            excluded.add(cur)
            cur += timedelta(days=1)
        # ブロック終了後の回復期間
        for i in range(1, long_event_recovery_days + 1):
            excluded.add(b_end + timedelta(days=i))

    return excluded


# ── 評価ポリシー: PolicyMetrics と集計 ──────────────────────────────────────────

@dataclass
class PolicyMetrics:
    """1 つの evaluation policy に対する metrics 集計結果。

    フィールド:
      policy     : ポリシー名 (POLICY_ALL_DAYS / POLICY_EXCLUDE_FLAGGED_PLUS_RECOVERY)
      n_total    : policy 適用前の総予測点数
      n_used     : policy 適用後の評価対象点数
      n_excluded : 除外された点数 (n_total - n_used)
      mae        : Mean Absolute Error (kg)。n_used=0 の場合は None
      rmse       : Root Mean Squared Error (kg)。n_used=0 の場合は None
      bias       : 平均誤差 (pred - actual)。正=上振れ傾向。n_used=0 の場合は None
      mape       : Mean Absolute Percentage Error (%)。actual に 0 が含まれる場合や
                   n_used=0 の場合は None
    """
    policy:     str
    n_total:    int
    n_used:     int
    n_excluded: int
    mae:        Optional[float]
    rmse:       Optional[float]
    bias:       Optional[float]
    mape:       Optional[float]


def compute_policy_metrics(
    records: list[tuple],
    exclusion_dates: set[date],
    policies: Sequence[str],
    long_event_exclusion_dates: Optional[set[date]] = None,
) -> list[PolicyMetrics]:
    """複数の evaluation policy に対して metrics を計算する。

    records の各要素は (error, actual, predicted, origin_date, target_date) の 5-tuple。
    target_date が各 policy の除外日集合に含まれる場合に除外される。

    引数:
      records                    : run_backtest が返す 1 モデル × 1 ホライズンの予測結果リスト
      exclusion_dates            : build_exclusion_dates() が返す除外日集合
                                   (POLICY_EXCLUDE_FLAGGED_PLUS_RECOVERY で使用)
      policies                   : 計算対象のポリシー名リスト
      long_event_exclusion_dates : build_long_event_exclusion_dates() が返す除外日集合
                                   (POLICY_EXCLUDE_LONG_EVENT_BLOCKS で使用)
                                   None の場合は空集合として扱う (後方互換)

    戻り値:
      PolicyMetrics のリスト (policies と同じ順序)
    """
    n_total = len(records)
    result: list[PolicyMetrics] = []
    _long_event_excluded = long_event_exclusion_dates or set()

    for policy in policies:
        if policy == POLICY_ALL_DAYS:
            used = records
        elif policy == POLICY_EXCLUDE_FLAGGED_PLUS_RECOVERY:
            used = [r for r in records if r[4] not in exclusion_dates]
        elif policy == POLICY_EXCLUDE_LONG_EVENT_BLOCKS:
            used = [r for r in records if r[4] not in _long_event_excluded]
        else:
            log.warning("未知の eval_policy をスキップ: %s", policy)
            continue

        n_used = len(used)
        n_excluded = n_total - n_used

        if not used:
            result.append(PolicyMetrics(
                policy=policy,
                n_total=n_total,
                n_used=0,
                n_excluded=n_excluded,
                mae=None,
                rmse=None,
                bias=None,
                mape=None,
            ))
            continue

        errors  = [r[0] for r in used]
        actuals = [r[1] for r in used]
        m = compute_metrics(errors, actuals)
        result.append(PolicyMetrics(
            policy=policy,
            n_total=n_total,
            n_used=n_used,
            n_excluded=n_excluded,
            mae=m["mae"],
            rmse=m["rmse"],
            bias=m["bias"],
            mape=m["mape"],
        ))

    return result


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

    評価ポリシー:
      config.eval_policies の各ポリシーについて metrics を算出し、
      forecast_backtest_metrics に 1 行ずつ保存する。
      UNIQUE 制約: (run_id, model_name, horizon_days, eval_policy)
      #364 では run_id + eval_policy で比較クエリを行う。
    """
    run_id = str(uuid.uuid4())
    origins = select_origins(df, config)

    # 除外日集合を構築 (exclude_flagged_plus_recovery ポリシーで使用)
    exclusion_dates = build_exclusion_dates(
        df, config.recovery_days, config.manual_event_periods
    )
    log.info(
        "評価ポリシー除外日 (exclude_flagged_plus_recovery): %d 日 (recovery_days=%d, manual_periods=%d)",
        len(exclusion_dates), config.recovery_days, len(config.manual_event_periods),
    )

    # 長期イベントブロック除外日集合を構築 (exclude_long_event_blocks ポリシーで使用)
    long_event_exclusion_dates = build_long_event_exclusion_dates(
        df, config.long_event_threshold, config.long_event_recovery_days, config.manual_event_periods
    )
    log.info(
        "評価ポリシー除外日 (exclude_long_event_blocks): %d 日 "
        "(threshold=%d, recovery=%d)",
        len(long_event_exclusion_dates),
        config.long_event_threshold,
        config.long_event_recovery_days,
    )

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
            f"step={config.origin_step_days}d, "
            f"policies={config.eval_policies}"
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
            # 評価ポリシー設定 (#364 での再現・比較に使用)
            "eval_policies":           config.eval_policies,
            "recovery_days":           config.recovery_days,
            "manual_event_periods": [
                {
                    "start": ep.start_date.isoformat(),
                    "end":   ep.end_date.isoformat(),
                    **( {"reason": ep.reason} if ep.reason else {} ),
                }
                for ep in config.manual_event_periods
            ],
            # 長期イベントブロック除外ポリシー用パラメータ (#480)
            "long_event_threshold":     config.long_event_threshold,
            "long_event_recovery_days": config.long_event_recovery_days,
        },
    }
    sb.from_("forecast_backtest_runs").insert(run_row).execute()
    log.info("runs に挿入: run_id=%s, series_type=%s, feature_set=%s",
             run_id, config.series_type, config.feature_set)

    # 2. metrics テーブルに集計結果を挿入 (policy ごとに 1 行)
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

            # 全 policy の metrics を一括計算
            policy_metrics_list = compute_policy_metrics(
                records, exclusion_dates, config.eval_policies,
                long_event_exclusion_dates=long_event_exclusion_dates,
            )

            for pm in policy_metrics_list:
                if pm.mae is None:
                    # 全件除外 → mae/rmse/bias/mape は NULL だが行自体は保存する。
                    # #364 が run_id + eval_policy で比較クエリする際、
                    # 「policy が存在しない」と「全件除外だった」を区別できるようにするため。
                    log.warning(
                        "  %s h=%dd policy=%s: 有効な評価点なし (n_total=%d, n_excluded=%d)。"
                        "metrics=NULL で保存します。",
                        model_name, horizon, pm.policy, pm.n_total, pm.n_excluded,
                    )

                metric_rows.append({
                    "run_id":        run_id,
                    "model_name":    model_name,
                    "horizon_days":  horizon,
                    "eval_policy":   pm.policy,
                    "mae":           round(pm.mae,  4) if pm.mae  is not None else None,
                    "rmse":          round(pm.rmse, 4) if pm.rmse is not None else None,
                    "mape":          round(pm.mape, 4) if pm.mape is not None else None,
                    "bias":          round(pm.bias, 4) if pm.bias is not None else None,
                    "n_predictions": pm.n_used,       # n_used と同義 (後方互換)
                    "n_total":       pm.n_total,
                    "n_excluded":    pm.n_excluded,
                    "extra":         {},
                })

            # 個別予測点の記録 (policy に依存しない raw 予測値)
            errors       = [r[0] for r in records]
            actuals      = [r[1] for r in records]
            preds        = [r[2] for r in records]
            origins_list = [r[3] for r in records]
            targets      = [r[4] for r in records]
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


# ── ポリシー別サマリーログ ──────────────────────────────────────────────────────

def log_policy_summary(
    results: BacktestResults,
    config: BacktestConfig,
    exclusion_dates: set[date],
    long_event_exclusion_dates: Optional[set[date]] = None,
) -> None:
    """evaluation policy ごとの metrics サマリーをログ出力する。

    all_days / exclude_flagged_plus_recovery / exclude_long_event_blocks を並べて出力し、
    各ポリシー間の精度差を確認できる。
    """
    _long_event = long_event_exclusion_dates or set()
    log.info(
        "=== policy 別サマリー (series_type=%s, recovery_days=%d, "
        "n_excluded_dates=%d, n_long_event_excluded=%d, "
        "long_event_threshold=%d, long_event_recovery=%d) ===",
        config.series_type, config.recovery_days, len(exclusion_dates),
        len(_long_event), config.long_event_threshold, config.long_event_recovery_days,
    )
    for model_name in results:
        for horizon in config.horizons:
            records = results[model_name].get(horizon, [])
            if not records:
                continue
            policy_metrics_list = compute_policy_metrics(
                records, exclusion_dates, config.eval_policies,
                long_event_exclusion_dates=_long_event,
            )
            for pm in policy_metrics_list:
                if pm.mae is None:
                    log.info(
                        "  %-20s h=%2dd  [%-40s]  n_used=0 (n_total=%d, n_excluded=%d)",
                        model_name, horizon, pm.policy, pm.n_total, pm.n_excluded,
                    )
                else:
                    mape_str = f"{pm.mape:.2f}%" if pm.mape is not None else "N/A"
                    log.info(
                        "  %-20s h=%2dd  [%-40s]  "
                        "MAE=%.3f  RMSE=%.3f  MAPE=%s  bias=%.3f  "
                        "n_used=%d  n_excluded=%d",
                        model_name, horizon, pm.policy,
                        pm.mae, pm.rmse, mape_str, pm.bias,
                        pm.n_used, pm.n_excluded,
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
    parser.add_argument(
        "--eval-policies",
        nargs="+",
        default=list(_DEFAULT_EVAL_POLICIES),
        dest="eval_policies",
        choices=[
            POLICY_ALL_DAYS,
            POLICY_EXCLUDE_FLAGGED_PLUS_RECOVERY,
            POLICY_EXCLUDE_LONG_EVENT_BLOCKS,
        ],
        metavar="POLICY",
        help=(
            "算出する評価ポリシー (スペース区切りで複数指定可)。"
            f"デフォルト: {_DEFAULT_EVAL_POLICIES}。"
            f"選択肢: {POLICY_ALL_DAYS} / {POLICY_EXCLUDE_FLAGGED_PLUS_RECOVERY} / "
            f"{POLICY_EXCLUDE_LONG_EVENT_BLOCKS}"
        ),
    )
    parser.add_argument(
        "--long-event-threshold",
        type=int,
        default=_DEFAULT_LONG_EVENT_THRESHOLD,
        dest="long_event_threshold",
        help=(
            f"長期イベントブロックとみなす最小連続イベント日数 (#480 初期仮説値)。"
            f"デフォルト: {_DEFAULT_LONG_EVENT_THRESHOLD}。"
            "この値以上の連続イベント区間が exclude_long_event_blocks ポリシーの対象になる。"
        ),
    )
    parser.add_argument(
        "--long-event-recovery-days",
        type=int,
        default=_DEFAULT_LONG_EVENT_RECOVERY_DAYS,
        dest="long_event_recovery_days",
        help=(
            f"長期イベントブロック終了後の回復期間 (日数) (#480 初期仮説値)。"
            f"デフォルト: {_DEFAULT_LONG_EVENT_RECOVERY_DAYS}。"
        ),
    )
    parser.add_argument(
        "--recovery-days",
        type=int,
        default=_DEFAULT_RECOVERY_DAYS,
        dest="recovery_days",
        help=(
            "チートデイ / 旅行日後の回復期間 (日数)。"
            f"デフォルト: {_DEFAULT_RECOVERY_DAYS}。"
            "この日数分だけ、イベント日の翌日以降も除外される。"
        ),
    )
    parser.add_argument(
        "--event-periods",
        nargs="*",
        default=[],
        dest="event_periods",
        type=parse_event_period,
        metavar="START:END",
        help=(
            "手動指定のイベント期間 (旅行・遠征など長期逸脱)。"
            "形式: 'YYYY-MM-DD:YYYY-MM-DD' (スペース区切りで複数指定可)。"
            "例: --event-periods 2026-03-01:2026-03-10 2026-04-05:2026-04-08"
        ),
    )
    args = parser.parse_args()

    config = build_config(args)
    log.info(
        "実験 config: series_type=%s, feature_set=%s, horizons=%s, "
        "max_origins=%d, origin_step_days=%d, np_epochs=%d, "
        "eval_policies=%s, recovery_days=%d, manual_event_periods=%d件, "
        "long_event_threshold=%d, long_event_recovery_days=%d",
        config.series_type, config.feature_set, config.horizons,
        config.max_origins, config.origin_step_days, config.np_epochs,
        config.eval_policies, config.recovery_days, len(config.manual_event_periods),
        config.long_event_threshold, config.long_event_recovery_days,
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

    # policy 別サマリー (除外前後の比較)
    exclusion_dates = build_exclusion_dates(
        df, config.recovery_days, config.manual_event_periods
    )
    long_event_exclusion_dates = build_long_event_exclusion_dates(
        df, config.long_event_threshold, config.long_event_recovery_days,
        config.manual_event_periods,
    )
    log_policy_summary(results, config, exclusion_dates, long_event_exclusion_dates)

    run_id = save_results(sb, df, results, config)
    log.info(
        "バックテスト完了。run_id=%s, series_type=%s, feature_set=%s",
        run_id, config.series_type, config.feature_set,
    )


if __name__ == "__main__":
    main()
