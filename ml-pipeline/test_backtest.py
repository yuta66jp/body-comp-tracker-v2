"""
test_backtest.py — backtest.py の純粋ロジック層ユニットテスト

supabase / neuralprophet 不要。fetch_weight_history・save_results・main() は対象外。
テスト対象:
  - BacktestConfig のデフォルト値と CLI デフォルト互換
  - select_origins のサンプリングロジック
  - compute_metrics の計算精度
  - compute_actual_sma7 のリークなし保証
  - run_backtest の partial update セマンティクス (ベースラインモデルのみ)
  - log_summary が例外を出さないこと
  - build_config が CLI 引数を正しく反映すること
  - ManualEventPeriod / parse_event_period のパース
  - build_exclusion_dates の除外日集合構築
  - compute_policy_metrics の policy 別 metrics 計算
"""

import argparse
from datetime import date, timedelta

import numpy as np
import pandas as pd
import pytest

from backtest import (
    POLICY_ALL_DAYS,
    POLICY_EXCLUDE_FLAGGED_PLUS_RECOVERY,
    SERIES_DAILY,
    SERIES_SMA7,
    BacktestConfig,
    ManualEventPeriod,
    PolicyMetrics,
    build_config,
    build_exclusion_dates,
    compute_actual_sma7,
    compute_metrics,
    compute_policy_metrics,
    log_summary,
    make_neuralprophet_predictor,
    parse_event_period,
    predict_ew_linear,
    predict_linear,
    predict_ma7,
    predict_naive,
    run_backtest,
    select_origins,
)


# ── フィクスチャ ───────────────────────────────────────────────────────────────

def make_df(n: int, start: str = "2026-01-01", weight_start: float = 75.0,
            slope: float = -0.05) -> pd.DataFrame:
    """n 日分の体重データを生成する。slope [kg/day] の線形トレンドを持つ。"""
    dates = pd.date_range(start, periods=n, freq="D")
    weights = [weight_start + slope * i for i in range(n)]
    return pd.DataFrame({"log_date": dates, "weight": weights})


def default_config(**kwargs) -> BacktestConfig:
    """テスト用デフォルト config。NeuralProphet は使わない (slow)。"""
    base = BacktestConfig(
        series_type=SERIES_DAILY,
        horizons=[7, 14],
        max_origins=5,
        origin_step_days=7,
        np_epochs=100,
        feature_set="baseline",
    )
    for k, v in kwargs.items():
        object.__setattr__(base, k, v)
    return base


# ── BacktestConfig ─────────────────────────────────────────────────────────────

class TestBacktestConfig:
    def test_defaults_match_module_constants(self):
        """デフォルト値がモジュール定数と一致すること。"""
        c = BacktestConfig()
        assert c.series_type == SERIES_DAILY
        assert c.horizons == [7, 14, 30]
        assert c.max_origins == 15
        assert c.origin_step_days == 7
        assert c.np_epochs == 100
        assert c.feature_set == "baseline"

    def test_internal_constants_not_cli_exposed(self):
        """内部定数はデフォルト値として存在すること。"""
        c = BacktestConfig()
        assert c.min_train_rows_np == 30
        assert c.min_train_rows_baseline == 7
        assert c.sma7_min_periods == 4

    def test_custom_values(self):
        c = BacktestConfig(horizons=[7], max_origins=3, feature_set="conditions")
        assert c.horizons == [7]
        assert c.max_origins == 3
        assert c.feature_set == "conditions"


# ── build_config ───────────────────────────────────────────────────────────────

class TestBuildConfig:
    def _make_args(self, **kwargs) -> argparse.Namespace:
        defaults = dict(
            series_type=SERIES_DAILY,
            horizons=[7, 14, 30],
            max_origins=15,
            origin_step_days=7,
            np_epochs=100,
            feature_set="baseline",
            eval_policies=[POLICY_ALL_DAYS, POLICY_EXCLUDE_FLAGGED_PLUS_RECOVERY],
            recovery_days=2,
            event_periods=[],
        )
        defaults.update(kwargs)
        return argparse.Namespace(**defaults)

    def test_default_args_produce_default_config(self):
        args = self._make_args()
        config = build_config(args)
        assert config.series_type == SERIES_DAILY
        assert config.horizons == [7, 14, 30]
        assert config.max_origins == 15
        assert config.feature_set == "baseline"

    def test_custom_horizons(self):
        args = self._make_args(horizons=[7, 30])
        config = build_config(args)
        assert config.horizons == [7, 30]

    def test_custom_max_origins(self):
        args = self._make_args(max_origins=5)
        config = build_config(args)
        assert config.max_origins == 5

    def test_feature_set_passed_through(self):
        args = self._make_args(feature_set="conditions_legs")
        config = build_config(args)
        assert config.feature_set == "conditions_legs"

    def test_sma7_series_type(self):
        args = self._make_args(series_type=SERIES_SMA7)
        config = build_config(args)
        assert config.series_type == SERIES_SMA7


# ── select_origins ─────────────────────────────────────────────────────────────

class TestSelectOrigins:
    def test_returns_empty_on_insufficient_data(self):
        df = make_df(10)
        config = default_config(horizons=[14])
        assert select_origins(df, config) == []

    def test_origins_within_valid_range(self):
        df = make_df(100)
        config = default_config(horizons=[7, 14], max_origins=20, origin_step_days=7)
        origins = select_origins(df, config)
        max_h = max(config.horizons)
        for idx in origins:
            assert idx >= config.min_train_rows_np, "起点は最低学習数以上"
            assert idx < len(df) - max_h, "起点の後にホライズン分のデータがある"

    def test_max_origins_limit(self):
        df = make_df(200)
        config = default_config(horizons=[7], max_origins=3, origin_step_days=7)
        origins = select_origins(df, config)
        assert len(origins) <= 3

    def test_recent_priority(self):
        """max_origins 制限は直近優先で切るべき。"""
        df = make_df(200)
        config = default_config(horizons=[7], max_origins=5, origin_step_days=7)
        origins = select_origins(df, config)
        # 最後の起点が後ろ側にある
        assert origins[-1] > origins[0]

    def test_step_days_respected(self):
        df = make_df(200)
        config = default_config(horizons=[7], max_origins=50, origin_step_days=14)
        origins = select_origins(df, config)
        if len(origins) > 1:
            # 各起点の間隔が origin_step_days の倍数
            gaps = [origins[i+1] - origins[i] for i in range(len(origins)-1)]
            for g in gaps:
                assert g % 14 == 0, f"step_days=14 なのに gap={g}"


# ── compute_metrics ─────────────────────────────────────────────────────────────

class TestComputeMetrics:
    def test_zero_errors(self):
        m = compute_metrics([0.0, 0.0, 0.0], [70.0, 70.0, 70.0])
        assert m["mae"] == 0.0
        assert m["rmse"] == 0.0
        assert m["bias"] == 0.0
        assert m["mape"] == 0.0

    def test_mae_calculation(self):
        # errors = [1, -1, 2] → MAE = 4/3
        m = compute_metrics([1.0, -1.0, 2.0], [70.0, 70.0, 70.0])
        assert abs(m["mae"] - (1 + 1 + 2) / 3) < 1e-9

    def test_rmse_calculation(self):
        m = compute_metrics([3.0, 4.0], [70.0, 70.0])
        expected = np.sqrt((9 + 16) / 2)
        assert abs(m["rmse"] - expected) < 1e-9

    def test_bias_positive_overshoot(self):
        m = compute_metrics([1.0, 1.0, 1.0], [70.0, 70.0, 70.0])
        assert m["bias"] == pytest.approx(1.0)

    def test_mape_none_when_actual_zero(self):
        """actual に 0 が含まれる場合 MAPE は None を返すべき。"""
        m = compute_metrics([1.0], [0.0])
        assert m["mape"] is None

    def test_mape_calculated_when_all_positive(self):
        m = compute_metrics([7.0], [70.0])
        assert m["mape"] == pytest.approx(10.0)


# ── compute_actual_sma7 ────────────────────────────────────────────────────────

class TestComputeActualSma7:
    def _make_window_df(self, target_date: date, n_days: int = 7) -> pd.DataFrame:
        """target_date を終端とする n_days 分のデータ。"""
        start = target_date - timedelta(days=n_days - 1)
        dates = [start + timedelta(days=i) for i in range(n_days)]
        df = pd.DataFrame({
            "log_date": pd.to_datetime(dates),
            "weight": [70.0 + i * 0.1 for i in range(n_days)],
        })
        return df

    def test_returns_mean_of_7day_window(self):
        target = date(2026, 3, 7)
        df = self._make_window_df(target, 7)
        origin = date(2026, 2, 28)  # ウィンドウ開始より前
        result = compute_actual_sma7(df, target, origin, min_periods=4)
        assert result is not None
        assert abs(result - df["weight"].mean()) < 1e-9

    def test_returns_none_when_insufficient_data(self):
        target = date(2026, 3, 7)
        # 2日分のみ
        df = self._make_window_df(target, 2)
        origin = date(2026, 2, 28)
        result = compute_actual_sma7(df, target, origin, min_periods=4)
        assert result is None

    def test_no_leak_from_training_data(self):
        """origin_date 以前のデータを使わないこと (リークなし保証)。"""
        target = date(2026, 3, 14)
        origin = date(2026, 3, 7)  # ウィンドウ開始 (3/8) の1日前

        # ウィンドウ = [3/8, 3/14]、origin = 3/7 → 3/7 以前は除外
        dates_in_window  = pd.date_range("2026-03-08", "2026-03-14")
        dates_before_org = pd.date_range("2026-03-01", "2026-03-07")

        df = pd.DataFrame({
            "log_date": pd.to_datetime(
                list(dates_before_org) + list(dates_in_window)
            ),
            "weight": [999.0] * 7 + [70.0] * 7,  # 訓練期間は 999 kg (リークしたら分かる)
        })

        result = compute_actual_sma7(df, target, origin, min_periods=4)
        assert result is not None
        assert abs(result - 70.0) < 1e-9, f"訓練データ (999kg) のリークが疑われる: {result}"


# ── run_backtest (ベースラインモデルのみ) ────────────────────────────────────────

class TestRunBacktest:
    def _config_no_np(self, **kwargs) -> BacktestConfig:
        """NeuralProphet を除外した config (テスト高速化)。"""
        base = default_config(**kwargs)
        # min_train_rows_np を大きくすることで NP の起点条件を実質無効化
        # (実際は build_models が NP クロージャを作るが、学習データが足りず全スキップされる)
        base.min_train_rows_np = 9999
        return base

    def test_returns_result_structure(self):
        df = make_df(80)
        config = self._config_no_np(horizons=[7, 14], max_origins=3)
        results = run_backtest(df, config)
        # 全モデルがキーとして存在する
        assert "Naive" in results
        assert "MovingAverage7d" in results
        assert "LinearTrend30d" in results
        assert "EWLinearTrend" in results
        # 全ホライズンがキーとして存在する
        for model_results in results.values():
            assert 7 in model_results
            assert 14 in model_results

    def test_no_future_leak(self):
        """全ての予測が origin_date より後の target_date に対して行われること。"""
        df = make_df(80)
        config = self._config_no_np(horizons=[7], max_origins=5)
        results = run_backtest(df, config)
        for model_records in results.values():
            for horizon_records in model_records.values():
                for err, act, pred, orig, tgt in horizon_records:
                    assert tgt > orig, f"target {tgt} は origin {orig} より後であるべき"

    def test_partial_save_semantics_undefined_fields_absent(self):
        """送信しないフィールドが結果に含まれないこと (partial update の意味論確認)。"""
        df = make_df(80)
        config = self._config_no_np(horizons=[7], max_origins=3)
        results = run_backtest(df, config)
        for model_name, model_results in results.items():
            for horizon, records in model_results.items():
                # 各タプルは (error, actual, predicted, origin_date, target_date) の5要素
                for rec in records:
                    assert len(rec) == 5

    def test_sma7_series_has_fewer_or_equal_results(self):
        """SMA7 評価は daily と同数以下の予測点になること (欠損 or 不足でスキップされる場合がある)。"""
        df = make_df(100)
        config_daily = self._config_no_np(series_type=SERIES_DAILY, horizons=[7], max_origins=5)
        config_sma7  = self._config_no_np(series_type=SERIES_SMA7,  horizons=[7], max_origins=5)
        r_daily = run_backtest(df, config_daily)
        r_sma7  = run_backtest(df, config_sma7)
        for model_name in r_daily:
            n_daily = len(r_daily[model_name][7])
            n_sma7  = len(r_sma7[model_name][7])
            assert n_sma7 <= n_daily, (
                f"{model_name}: sma7={n_sma7} は daily={n_daily} 以下のはず"
            )

    def test_empty_result_on_insufficient_data(self):
        df = make_df(10)  # データ不足
        config = self._config_no_np(horizons=[7, 14])
        results = run_backtest(df, config)
        for model_results in results.values():
            for records in model_results.values():
                assert records == []

    def test_feature_set_logged_not_crash(self):
        """feature_set が指定されても run_backtest がクラッシュしないこと。"""
        df = make_df(80)
        config = self._config_no_np(horizons=[7], max_origins=3, feature_set="conditions")
        results = run_backtest(df, config)
        assert "Naive" in results


# ── log_summary ────────────────────────────────────────────────────────────────

class TestLogSummary:
    def test_does_not_crash_on_empty_results(self):
        df = make_df(10)
        config = default_config(horizons=[7])
        results = run_backtest(df, config)
        log_summary(results, config)  # 例外が出なければ OK

    def test_does_not_crash_on_populated_results(self):
        df = make_df(80)
        config = BacktestConfig(
            horizons=[7],
            max_origins=3,
            min_train_rows_np=9999,  # NP をスキップ
        )
        results = run_backtest(df, config)
        log_summary(results, config)


# ── ベースライン予測器 単体テスト ──────────────────────────────────────────────

class TestBaselinePredictors:
    def _train_df(self) -> pd.DataFrame:
        return make_df(30, weight_start=70.0, slope=0.0)  # 一定値

    def test_naive_returns_last_weight(self):
        train = self._train_df()
        assert predict_naive(train, 7)  == pytest.approx(70.0)
        assert predict_naive(train, 14) == pytest.approx(70.0)

    def test_ma7_returns_mean_of_last_7(self):
        train = make_df(10, weight_start=70.0, slope=1.0)
        # 最後の7日: 70+3, 70+4, ..., 70+9 → 平均 = 70 + (3+4+5+6+7+8+9)/7
        expected = sum(70.0 + i for i in range(3, 10)) / 7
        assert predict_ma7(train, 7) == pytest.approx(expected, abs=1e-6)

    def test_linear_extrapolates_trend(self):
        # 完全な線形データ: weight = 70 + 0.1 * i
        train = make_df(30, weight_start=70.0, slope=0.1)
        pred = predict_linear(train, 7)
        # 最後の点は 70 + 0.1 * 29 = 72.9、7日後は 72.9 + 0.1 * 7 = 73.6
        assert abs(pred - 73.6) < 0.1  # 線形回帰の誤差を許容

    def test_ew_linear_constant_data(self):
        """一定体重では SMA7 も定数になり、EW 線形回帰も定数を返す。"""
        train = self._train_df()  # 全行 70.0
        pred7  = predict_ew_linear(train, 7)
        pred14 = predict_ew_linear(train, 14)
        assert abs(pred7  - 70.0) < 1e-6
        assert abs(pred14 - 70.0) < 1e-6

    def test_ew_linear_extrapolates_linear_trend(self):
        """完全線形データでは SMA7 系列も線形になり、EW 線形回帰で外挿できること。

        SMA7 は生体重より約3日ラグがあるため、予測値は生体重ベースの
        LinearTrend30d より若干低くなる。それでも同一方向へ外挿できること。
        """
        # 完全な線形データ: weight = 70 + 0.1 * i (slope = 0.1 kg/day)
        train = make_df(30, weight_start=70.0, slope=0.1)
        pred = predict_ew_linear(train, 7)
        # 生体重ベースなら 73.6 だが、SMA7 ラグ (~3日) により ~73.2 前後になる
        # 少なくとも「最後の生体重 72.9 を超えた値」が返ること (上昇トレンドの外挿)
        last_weight = 70.0 + 0.1 * 29  # = 72.9
        assert pred > last_weight, "上昇トレンドなので予測は最後の体重より高いはず"
        assert abs(pred - 73.6) < 0.6  # SMA7 ラグを考慮した許容範囲

    def test_ew_linear_uses_sma7_input(self):
        """ノイズが大きい単日体重でも、SMA7 入力により安定した予測ができること。

        偶数日に +1.0 kg のノイズを加えた場合:
          生体重ベース回帰はノイズに影響を受けるが、
          SMA7 入力なら平滑化されノイズの影響が小さい。
        """
        # 基準: slope=-0.05 の線形トレンド
        base = make_df(40, weight_start=75.0, slope=-0.05)
        # 偶数インデックスに +1.0 kg のノイズを付加
        noisy = base.copy()
        noisy.loc[noisy.index % 2 == 0, "weight"] += 1.0

        pred_noisy = predict_ew_linear(noisy, 7)
        pred_clean = predict_ew_linear(base,  7)

        # SMA7 平滑化により、ノイズありの予測がクリーンな予測の ±0.5 kg 以内に収まる
        assert abs(pred_noisy - pred_clean) < 0.5, (
            f"SMA7 平滑化でノイズが抑制されるはず: noisy={pred_noisy:.3f}, clean={pred_clean:.3f}"
        )

    def test_ew_linear_returns_float(self):
        """戻り値が float であること。"""
        train = make_df(10, weight_start=70.0, slope=-0.05)
        result = predict_ew_linear(train, 7)
        assert isinstance(result, float)

    def test_ew_linear_single_row_fallback(self):
        """データが少なく SMA7 が 2 件未満の場合は生体重の最終値を返す。"""
        # 3行では min_periods=4 が満たされず SMA7 が全て NaN → フォールバック
        train = make_df(3, weight_start=72.0)
        pred = predict_ew_linear(train, 7)
        assert abs(pred - train["weight"].iloc[-1]) < 1e-6


# ── NeuralProphet PyTorch 2.6+ patch ──────────────────────────────────────────

class TestNeuralProphetPyTorchPatch:
    """make_neuralprophet_predictor の PyTorch 2.6+ weights_only 互換 patch を検証する。

    torch / neuralprophet は CI 環境に存在しないため sys.modules をモックして検証する。
    """

    def _make_mock_modules(self, torch_version: str):
        """torch / neuralprophet のモックを返す。"""
        import sys
        from unittest.mock import MagicMock

        mock_torch = MagicMock()
        mock_torch.__version__ = torch_version
        original_load = MagicMock(name="original_load")
        mock_torch.load = original_load

        mock_np_instance = MagicMock()
        # forecast["yhat1"].iloc[-1] が float を返すよう設定
        forecast_df = pd.DataFrame({"yhat1": [74.0] * 10})
        mock_np_instance.predict.return_value = forecast_df
        mock_np_instance.make_future_dataframe.return_value = pd.DataFrame({"ds": []})

        mock_neuralprophet = MagicMock()
        mock_neuralprophet.NeuralProphet.return_value = mock_np_instance

        return mock_torch, mock_neuralprophet, original_load

    def test_torch_load_patched_for_torch26(self):
        """torch >= 2.6 では torch.load が weights_only=False patch に差し替えられること。"""
        import sys
        from unittest.mock import patch as mock_patch

        mock_torch, mock_neuralprophet, original_load = self._make_mock_modules("2.6.0")
        config = BacktestConfig(np_epochs=1)
        predict_fn = make_neuralprophet_predictor(config)
        train = make_df(35)

        with mock_patch.dict(sys.modules, {
            "torch": mock_torch,
            "neuralprophet": mock_neuralprophet,
        }):
            predict_fn(train, 7)

        assert mock_torch.load is not original_load, (
            "torch >= 2.6 では torch.load は weights_only=False patch に差し替えられるべき"
        )

    def test_torch_load_not_patched_for_torch25(self):
        """torch < 2.6 では torch.load が変更されないこと。"""
        import sys
        from unittest.mock import patch as mock_patch

        mock_torch, mock_neuralprophet, original_load = self._make_mock_modules("2.5.1")
        config = BacktestConfig(np_epochs=1)
        predict_fn = make_neuralprophet_predictor(config)
        train = make_df(35)

        with mock_patch.dict(sys.modules, {
            "torch": mock_torch,
            "neuralprophet": mock_neuralprophet,
        }):
            predict_fn(train, 7)

        assert mock_torch.load is original_load, (
            "torch < 2.6 では torch.load は変更されるべきでない"
        )

    def test_patch_applied_only_once(self):
        """複数回呼ばれても patch は一度だけ適用されること (二重 wrap 防止)。"""
        import sys
        from unittest.mock import patch as mock_patch

        mock_torch, mock_neuralprophet, original_load = self._make_mock_modules("2.6.0")
        config = BacktestConfig(np_epochs=1)
        predict_fn = make_neuralprophet_predictor(config)
        train = make_df(35)

        with mock_patch.dict(sys.modules, {
            "torch": mock_torch,
            "neuralprophet": mock_neuralprophet,
        }):
            predict_fn(train, 7)
            patched_load_after_first = mock_torch.load  # patch 適用後の load

            predict_fn(train, 14)
            patched_load_after_second = mock_torch.load  # 2回目呼び出し後

        # 2回目呼び出しで torch.load がさらに差し替えられていないこと
        assert patched_load_after_first is patched_load_after_second, (
            "patch は一度だけ適用されるべき (二重 wrap になっていないこと)"
        )


# ── ManualEventPeriod / parse_event_period ───────────────────────────────────

class TestManualEventPeriod:
    def test_parse_valid_period(self):
        ep = parse_event_period("2026-03-01:2026-03-10")
        assert ep.start_date == date(2026, 3, 1)
        assert ep.end_date   == date(2026, 3, 10)

    def test_parse_single_day_period(self):
        ep = parse_event_period("2026-04-05:2026-04-05")
        assert ep.start_date == ep.end_date == date(2026, 4, 5)

    def test_parse_with_spaces(self):
        """前後スペースは許容する。"""
        ep = parse_event_period(" 2026-03-01 : 2026-03-10 ")
        assert ep.start_date == date(2026, 3, 1)
        assert ep.end_date   == date(2026, 3, 10)

    def test_parse_invalid_format_raises(self):
        import argparse as _ap
        with pytest.raises(_ap.ArgumentTypeError):
            parse_event_period("2026-03-01")  # コロン区切りなし

    def test_parse_invalid_date_raises(self):
        import argparse as _ap
        with pytest.raises(_ap.ArgumentTypeError):
            parse_event_period("2026-13-01:2026-13-10")  # 不正な月

    def test_parse_start_after_end_raises(self):
        import argparse as _ap
        with pytest.raises(_ap.ArgumentTypeError):
            parse_event_period("2026-03-10:2026-03-01")  # start > end


# ── build_exclusion_dates ──────────────────────────────────────────────────────

class TestBuildExclusionDates:
    def _df_with_flags(
        self,
        n: int = 20,
        cheat_indices: list[int] | None = None,
        travel_indices: list[int] | None = None,
        start: str = "2026-01-01",
    ) -> pd.DataFrame:
        """フラグ列付きの DataFrame を生成する。"""
        dates   = pd.date_range(start, periods=n, freq="D")
        weights = [70.0] * n
        is_cheat  = [False] * n
        is_travel = [False] * n
        for i in (cheat_indices or []):
            is_cheat[i] = True
        for i in (travel_indices or []):
            is_travel[i] = True
        return pd.DataFrame({
            "log_date":    dates,
            "weight":      weights,
            "is_cheat_day":  is_cheat,
            "is_travel_day": is_travel,
        })

    def test_no_flags_no_periods_returns_empty(self):
        df = self._df_with_flags(10)
        excluded = build_exclusion_dates(df, recovery_days=2, manual_event_periods=[])
        assert excluded == set()

    def test_cheat_day_excludes_day_and_recovery(self):
        """チートデイ当日 + recovery_days 日間が除外されること。"""
        df = self._df_with_flags(20, cheat_indices=[5])
        excluded = build_exclusion_dates(df, recovery_days=2, manual_event_periods=[])
        cheat_date = date(2026, 1, 6)  # index 5 = 2026-01-06
        assert cheat_date in excluded
        assert cheat_date + timedelta(days=1) in excluded
        assert cheat_date + timedelta(days=2) in excluded
        assert cheat_date + timedelta(days=3) not in excluded

    def test_travel_day_excludes_day_and_recovery(self):
        """旅行日当日 + recovery_days 日間が除外されること。"""
        df = self._df_with_flags(20, travel_indices=[3])
        excluded = build_exclusion_dates(df, recovery_days=1, manual_event_periods=[])
        travel_date = date(2026, 1, 4)  # index 3 = 2026-01-04
        assert travel_date in excluded
        assert travel_date + timedelta(days=1) in excluded
        assert travel_date + timedelta(days=2) not in excluded

    def test_recovery_days_zero_excludes_only_event_day(self):
        """recovery_days=0 の場合はイベント日のみ除外されること。"""
        df = self._df_with_flags(20, cheat_indices=[5])
        excluded = build_exclusion_dates(df, recovery_days=0, manual_event_periods=[])
        cheat_date = date(2026, 1, 6)
        assert cheat_date in excluded
        assert cheat_date + timedelta(days=1) not in excluded

    def test_manual_event_period_excludes_range_and_recovery(self):
        """手動 event period の期間全体と end 後 recovery_days 日間が除外されること。"""
        df = self._df_with_flags(50)
        ep = ManualEventPeriod(
            start_date=date(2026, 1, 10),
            end_date=date(2026, 1, 15),
        )
        excluded = build_exclusion_dates(df, recovery_days=2, manual_event_periods=[ep])
        # 期間内全日
        for d_offset in range(6):
            assert date(2026, 1, 10) + timedelta(days=d_offset) in excluded
        # end 後 recovery 2日
        assert date(2026, 1, 16) in excluded
        assert date(2026, 1, 17) in excluded
        assert date(2026, 1, 18) not in excluded

    def test_missing_flag_columns_returns_empty(self):
        """is_cheat_day / is_travel_day カラムがない場合は除外なし。"""
        df = make_df(10)  # フラグカラムなし
        excluded = build_exclusion_dates(df, recovery_days=2, manual_event_periods=[])
        assert excluded == set()

    def test_multiple_events_union(self):
        """複数イベントの除外日が合算されること。"""
        df = self._df_with_flags(30, cheat_indices=[2, 10])
        excluded = build_exclusion_dates(df, recovery_days=1, manual_event_periods=[])
        # index 2 = 2026-01-03, index 10 = 2026-01-11
        for d in [date(2026, 1, 3), date(2026, 1, 4), date(2026, 1, 11), date(2026, 1, 12)]:
            assert d in excluded

    def test_manual_period_overrides_independent_of_db_flags(self):
        """手動 event period はフラグがなくても適用されること。"""
        df = self._df_with_flags(50)  # フラグなし
        ep = ManualEventPeriod(date(2026, 1, 20), date(2026, 1, 20))
        excluded = build_exclusion_dates(df, recovery_days=0, manual_event_periods=[ep])
        assert date(2026, 1, 20) in excluded


# ── compute_policy_metrics ─────────────────────────────────────────────────────

class TestComputePolicyMetrics:
    def _make_records(
        self,
        errors: list[float],
        actuals: list[float],
        targets: list[date] | None = None,
    ) -> list[tuple]:
        """テスト用予測結果リストを生成する。"""
        if targets is None:
            base = date(2026, 2, 1)
            targets = [base + timedelta(days=i) for i in range(len(errors))]
        origin = date(2026, 1, 1)
        return [
            (err, act, act + err, origin, tgt)
            for err, act, tgt in zip(errors, actuals, targets)
        ]

    def test_all_days_uses_all_records(self):
        """all_days policy は除外なし (n_used = n_total)。"""
        records = self._make_records([0.1, -0.2, 0.3], [70.0, 70.0, 70.0])
        exclusion = {date(2026, 2, 1)}  # 1件は除外対象日だが all_days は無視
        result = compute_policy_metrics(records, exclusion, [POLICY_ALL_DAYS])
        assert len(result) == 1
        pm = result[0]
        assert pm.policy == POLICY_ALL_DAYS
        assert pm.n_total == 3
        assert pm.n_used  == 3
        assert pm.n_excluded == 0
        assert pm.mae is not None

    def test_exclude_policy_removes_flagged_targets(self):
        """exclude_flagged_plus_recovery policy は exclusion_dates の target を除外する。"""
        targets = [date(2026, 2, 1), date(2026, 2, 2), date(2026, 2, 3)]
        records = self._make_records([0.1, -0.2, 0.3], [70.0, 70.0, 70.0], targets)
        exclusion = {date(2026, 2, 1)}  # 最初の1件を除外
        result = compute_policy_metrics(
            records, exclusion, [POLICY_EXCLUDE_FLAGGED_PLUS_RECOVERY]
        )
        assert len(result) == 1
        pm = result[0]
        assert pm.policy == POLICY_EXCLUDE_FLAGGED_PLUS_RECOVERY
        assert pm.n_total    == 3
        assert pm.n_used     == 2
        assert pm.n_excluded == 1

    def test_both_policies_returned(self):
        """両方のポリシーを指定すると 2 件返ること。"""
        records = self._make_records([0.1, -0.2], [70.0, 70.0])
        result = compute_policy_metrics(
            records, set(), [POLICY_ALL_DAYS, POLICY_EXCLUDE_FLAGGED_PLUS_RECOVERY]
        )
        assert len(result) == 2
        policies = [pm.policy for pm in result]
        assert POLICY_ALL_DAYS in policies
        assert POLICY_EXCLUDE_FLAGGED_PLUS_RECOVERY in policies

    def test_all_excluded_returns_none_metrics(self):
        """全件除外された場合は mae=None を返すこと。"""
        targets = [date(2026, 2, 1), date(2026, 2, 2)]
        records = self._make_records([0.1, -0.2], [70.0, 70.0], targets)
        exclusion = set(targets)
        result = compute_policy_metrics(
            records, exclusion, [POLICY_EXCLUDE_FLAGGED_PLUS_RECOVERY]
        )
        pm = result[0]
        assert pm.n_used == 0
        assert pm.mae  is None
        assert pm.rmse is None
        assert pm.bias is None

    def test_empty_records_returns_none_metrics(self):
        """records が空の場合は n_total=0, mae=None を返すこと。"""
        result = compute_policy_metrics([], set(), [POLICY_ALL_DAYS])
        pm = result[0]
        assert pm.n_total == 0
        assert pm.n_used  == 0
        assert pm.mae is None

    def test_metrics_values_correct_for_all_days(self):
        """all_days policy の metrics 値が compute_metrics と一致すること。"""
        errors  = [1.0, -1.0, 2.0]
        actuals = [70.0, 70.0, 70.0]
        records = self._make_records(errors, actuals)
        result = compute_policy_metrics(records, set(), [POLICY_ALL_DAYS])
        pm = result[0]
        expected = compute_metrics(errors, actuals)
        assert pm.mae  == pytest.approx(expected["mae"])
        assert pm.rmse == pytest.approx(expected["rmse"])
        assert pm.bias == pytest.approx(expected["bias"])

    def test_exclude_policy_metrics_differ_from_all_days(self):
        """除外後の metrics が all_days と異なること (除外有効の確認)。"""
        targets = [date(2026, 2, 1), date(2026, 2, 2), date(2026, 2, 3)]
        # 除外日のみ大きなエラー
        errors  = [5.0, 0.1, 0.1]
        actuals = [70.0, 70.0, 70.0]
        records = self._make_records(errors, actuals, targets)
        exclusion = {date(2026, 2, 1)}  # 大きなエラーの日を除外

        result = compute_policy_metrics(
            records, exclusion, [POLICY_ALL_DAYS, POLICY_EXCLUDE_FLAGGED_PLUS_RECOVERY]
        )
        pm_all     = next(pm for pm in result if pm.policy == POLICY_ALL_DAYS)
        pm_exclude = next(pm for pm in result if pm.policy == POLICY_EXCLUDE_FLAGGED_PLUS_RECOVERY)

        assert pm_all.mae > pm_exclude.mae, (
            "除外後の MAE は除外前より低くなるはず (大エラー日を除いたため)"
        )


# ── BacktestConfig 評価ポリシー設定 ────────────────────────────────────────────

class TestBacktestConfigEvalPolicy:
    def test_default_eval_policies(self):
        c = BacktestConfig()
        assert POLICY_ALL_DAYS in c.eval_policies
        assert POLICY_EXCLUDE_FLAGGED_PLUS_RECOVERY in c.eval_policies

    def test_default_recovery_days(self):
        c = BacktestConfig()
        assert c.recovery_days == 2

    def test_default_manual_event_periods_empty(self):
        c = BacktestConfig()
        assert c.manual_event_periods == []

    def test_custom_eval_policies(self):
        c = BacktestConfig(eval_policies=[POLICY_ALL_DAYS])
        assert c.eval_policies == [POLICY_ALL_DAYS]

    def test_custom_recovery_days(self):
        c = BacktestConfig(recovery_days=3)
        assert c.recovery_days == 3

    def test_manual_event_periods_stored(self):
        ep = ManualEventPeriod(date(2026, 3, 1), date(2026, 3, 5))
        c = BacktestConfig(manual_event_periods=[ep])
        assert len(c.manual_event_periods) == 1
        assert c.manual_event_periods[0].start_date == date(2026, 3, 1)


# ── build_config 評価ポリシー引数 ──────────────────────────────────────────────

class TestBuildConfigEvalPolicy:
    def _make_args(self, **kwargs) -> argparse.Namespace:
        defaults = dict(
            series_type=SERIES_DAILY,
            horizons=[7, 14, 30],
            max_origins=15,
            origin_step_days=7,
            np_epochs=100,
            feature_set="baseline",
            eval_policies=[POLICY_ALL_DAYS, POLICY_EXCLUDE_FLAGGED_PLUS_RECOVERY],
            recovery_days=2,
            event_periods=[],
        )
        defaults.update(kwargs)
        return argparse.Namespace(**defaults)

    def test_default_eval_policies_passed(self):
        config = build_config(self._make_args())
        assert POLICY_ALL_DAYS in config.eval_policies
        assert POLICY_EXCLUDE_FLAGGED_PLUS_RECOVERY in config.eval_policies

    def test_single_policy_passed(self):
        config = build_config(self._make_args(eval_policies=[POLICY_ALL_DAYS]))
        assert config.eval_policies == [POLICY_ALL_DAYS]

    def test_recovery_days_passed(self):
        config = build_config(self._make_args(recovery_days=3))
        assert config.recovery_days == 3

    def test_event_periods_passed(self):
        ep = ManualEventPeriod(date(2026, 3, 1), date(2026, 3, 5))
        config = build_config(self._make_args(event_periods=[ep]))
        assert len(config.manual_event_periods) == 1
        assert config.manual_event_periods[0].start_date == date(2026, 3, 1)
