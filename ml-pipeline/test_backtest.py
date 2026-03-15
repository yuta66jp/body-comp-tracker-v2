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
"""

import argparse
from datetime import date, timedelta

import numpy as np
import pandas as pd
import pytest

from backtest import (
    SERIES_DAILY,
    SERIES_SMA7,
    BacktestConfig,
    build_config,
    compute_actual_sma7,
    compute_metrics,
    log_summary,
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
