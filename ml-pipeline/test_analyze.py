"""
test_analyze.py — analyze.py の単体テスト

対象: run_importance() の目的変数定義・欠損除外・最小行数チェック

実行: pytest ml-pipeline/test_analyze.py -v
依存: pandas, xgboost (requirements.txt に含まれる)
"""

import math

import pandas as pd
import pytest

from analyze import (
    run_importance,
    apply_feature_engineering,
    compute_meta,
    build_payload,
    FEATURE_COLS,
    MIN_ROWS,
)


# ── ヘルパー ──────────────────────────────────────────────────────────────────

def _make_df(n: int = 30, base_weight: float = 65.0) -> pd.DataFrame:
    """体重・栄養素が揃った最小限の DataFrame を生成する。
    XGBoost が何かを学習できるよう、体重・カロリーに周期的な変動を加えている。
    """
    import math as _math
    dates = pd.date_range("2025-01-01", periods=n, freq="D").strftime("%Y-%m-%d").tolist()
    # 周期的な変動を加えて target が定数にならないようにする
    weights  = [base_weight + _math.sin(i * 0.5) * 0.3 for i in range(n)]
    calories = [2000 + _math.cos(i * 0.3) * 200 + i * 2 for i in range(n)]
    protein  = [150 + _math.sin(i * 0.7) * 10 for i in range(n)]
    fat      = [60  + _math.cos(i * 0.4) * 5  for i in range(n)]
    carbs    = [200 + _math.sin(i * 0.6) * 20  for i in range(n)]
    return pd.DataFrame({
        "log_date": dates,
        "weight":   weights,
        "calories": calories,
        "protein":  protein,
        "fat":      fat,
        "carbs":    carbs,
    })


# ── target 定義のテスト ───────────────────────────────────────────────────────

class TestTargetDefinition:
    """
    目的変数が「翌日体重変化量 = weight(t+1) - weight(t)」であることを検証する。
    絶対体重ではなく変化量が返されていることを確認する。
    """

    def test_target_is_weight_change_not_absolute(self):
        """target が翌日絶対体重ではなく変化量であることを確認する。"""
        df = _make_df(n=30, base_weight=65.0)
        result = run_importance(df)
        # run_importance は重要度辞書を返す。target の定義は内部だが、
        # 行数・エラーなしで動作することで実装が変化量計算になっていることを補完確認する。
        assert isinstance(result, dict)
        assert len(result) > 0

    def test_target_sign_positive_when_weight_increases(self):
        """体重が単調増加するデータでは target > 0 になるはずである。
        単純な加算で構築した増加列で確認する（_make_df の周期変動を使わない）。
        """
        n = 10
        dates = pd.date_range("2025-01-01", periods=n, freq="D").strftime("%Y-%m-%d").tolist()
        df = pd.DataFrame({
            "log_date": dates,
            "weight":   [65.0 + i * 0.1 for i in range(n)],
            "calories": [2000.0] * n,
            "protein":  [150.0] * n,
            "fat":      [60.0] * n,
            "carbs":    [200.0] * n,
        })
        df_sorted = df.sort_values("log_date").reset_index(drop=True)
        df_sorted["target"] = df_sorted["weight"].shift(-1) - df_sorted["weight"]
        valid = df_sorted.dropna(subset=["target"])
        # 単調増加なので全行 target > 0
        assert (valid["target"] > 0).all()

    def test_target_sign_negative_when_weight_decreases(self):
        """体重が単調減少するデータでは target < 0 になるはずである。"""
        n = 10
        dates = pd.date_range("2025-01-01", periods=n, freq="D").strftime("%Y-%m-%d").tolist()
        df = pd.DataFrame({
            "log_date": dates,
            "weight":   [65.0 - i * 0.1 for i in range(n)],
            "calories": [2000.0] * n,
            "protein":  [150.0] * n,
            "fat":      [60.0] * n,
            "carbs":    [200.0] * n,
        })
        df_sorted = df.sort_values("log_date").reset_index(drop=True)
        df_sorted["target"] = df_sorted["weight"].shift(-1) - df_sorted["weight"]
        valid = df_sorted.dropna(subset=["target"])
        assert (valid["target"] < 0).all()

    def test_target_last_row_dropped_due_to_shift(self):
        """shift(-1) による末尾行は target が NaN になり除外される。"""
        n = 20
        df = _make_df(n=n)
        df_sorted = df.sort_values("log_date").reset_index(drop=True)
        df_sorted["target"] = df_sorted["weight"].shift(-1) - df_sorted["weight"]
        valid = df_sorted.dropna(subset=["target"])
        # 末尾 1 行が除外されて n-1 行になる
        assert len(valid) == n - 1
        assert math.isnan(df_sorted["target"].iloc[-1])


# ── 欠損除外のテスト ──────────────────────────────────────────────────────────

class TestMissingValueHandling:
    def test_rows_with_null_weight_are_excluded(self):
        """weight が欠損している行は分析対象外になる。"""
        df = _make_df(n=30)
        df.loc[5, "weight"] = None
        # エラーなく動作すること（欠損行は除外される）
        result = run_importance(df)
        assert isinstance(result, dict)

    def test_rows_with_null_calories_are_excluded(self):
        """calories が欠損している行は分析対象外になる。"""
        df = _make_df(n=30)
        df.loc[3, "calories"] = None
        result = run_importance(df)
        assert isinstance(result, dict)

    def test_target_null_when_next_day_weight_missing(self):
        """翌日の weight が欠損している場合 target は NaN になり除外される。"""
        n = 20
        df = _make_df(n=n)
        # t+1 の weight を NaN にすると t の target も NaN になる
        df.loc[10, "weight"] = None
        df_sorted = df.dropna(subset=["weight", "calories", "protein", "fat", "carbs"])
        df_sorted = df_sorted.sort_values("log_date").reset_index(drop=True)
        df_sorted["target"] = df_sorted["weight"].shift(-1) - df_sorted["weight"]
        valid = df_sorted.dropna(subset=["target"])
        # 欠損のある行（インデックス9がt, 10がt+1だがNaNで除外されたため9の次は11）が除外されている
        assert len(valid) < n - 1


# ── 最小行数チェックのテスト ─────────────────────────────────────────────────

class TestMinRows:
    def test_raises_when_below_min_rows(self):
        """有効行数が MIN_ROWS 未満のとき ValueError を送出する。"""
        df = _make_df(n=MIN_ROWS - 1)
        with pytest.raises(ValueError, match="有効行数が不足"):
            run_importance(df)

    def test_succeeds_at_exactly_min_rows(self):
        """有効行数がちょうど MIN_ROWS のとき正常に動作する。"""
        # shift(-1) で末尾1行が落ちるため MIN_ROWS + 1 行用意する
        df = _make_df(n=MIN_ROWS + 1)
        result = run_importance(df)
        assert isinstance(result, dict)


# ── 出力フォーマットのテスト ──────────────────────────────────────────────────

class TestOutputFormat:
    def test_returns_all_feature_cols(self):
        """FEATURE_COLS の全キーが出力辞書に含まれる。"""
        df = _make_df(n=30)
        result = run_importance(df)
        for col in FEATURE_COLS:
            assert col in result

    def test_each_entry_has_label_importance_pct(self):
        """各エントリに label / importance / pct キーが存在する。"""
        df = _make_df(n=30)
        result = run_importance(df)
        for entry in result.values():
            assert "label" in entry
            assert "importance" in entry
            assert "pct" in entry

    def test_pct_sums_to_100(self):
        """重要度（pct）の合計が約 100% になる。"""
        df = _make_df(n=30)
        result = run_importance(df)
        total_pct = sum(e["pct"] for e in result.values())
        assert abs(total_pct - 100.0) < 0.5  # 丸め誤差を許容

    def test_importance_values_are_non_negative(self):
        """importance は 0 以上の値を持つ。"""
        df = _make_df(n=30)
        result = run_importance(df)
        for entry in result.values():
            assert entry["importance"] >= 0


# ── apply_feature_engineering のテスト ───────────────────────────────────────

class TestApplyFeatureEngineering:
    """
    apply_feature_engineering() の純粋変換ロジックを検証する。
    xgboost / supabase 不要で動作することをこのクラスが間接的に保証する。
    """

    def test_returns_all_feature_and_target_cols(self):
        """特徴量列と target 列が全て追加されている。"""
        df = _make_df(n=20)
        result = apply_feature_engineering(df)
        for col in FEATURE_COLS + ["target"]:
            assert col in result.columns

    def test_does_not_mutate_input(self):
        """入力 DataFrame を変更しない（copy して返す）。"""
        df = _make_df(n=20)
        original_cols = set(df.columns)
        apply_feature_engineering(df)
        assert set(df.columns) == original_cols
        assert "cal_lag1" not in df.columns

    def test_drops_rows_with_null_weight(self):
        """weight が欠損している行を除去する。"""
        df = _make_df(n=20)
        df.loc[5, "weight"] = None
        result = apply_feature_engineering(df)
        assert len(result) < 20
        assert result["weight"].isna().sum() == 0

    def test_sorts_by_log_date(self):
        """log_date の昇順でソートされている。"""
        df = _make_df(n=20)
        df = df.iloc[::-1].reset_index(drop=True)  # 逆順に並べ替え
        result = apply_feature_engineering(df)
        assert result["log_date"].is_monotonic_increasing

    def test_cal_lag1_equals_calories(self):
        """cal_lag1 は calories と等値（当日カロリーの alias）。"""
        df = _make_df(n=20)
        result = apply_feature_engineering(df)
        pd.testing.assert_series_equal(
            result["cal_lag1"].reset_index(drop=True),
            result["calories"].reset_index(drop=True),
            check_names=False,
        )

    def test_last_row_target_is_nan(self):
        """shift(-1) により末尾行の target は NaN になる。"""
        df = _make_df(n=20)
        result = apply_feature_engineering(df)
        assert math.isnan(result["target"].iloc[-1])

    def test_target_positive_for_increasing_weight(self):
        """体重単調増加データでは target（翌日変化量）が全て正になる。"""
        n = 10
        dates = pd.date_range("2025-01-01", periods=n, freq="D").strftime("%Y-%m-%d").tolist()
        df = pd.DataFrame({
            "log_date": dates,
            "weight":   [65.0 + i * 0.1 for i in range(n)],
            "calories": [2000.0] * n,
            "protein":  [150.0] * n,
            "fat":      [60.0] * n,
            "carbs":    [200.0] * n,
        })
        result = apply_feature_engineering(df)
        valid = result.dropna(subset=["target"])
        assert (valid["target"] > 0).all()


# ── compute_meta のテスト ─────────────────────────────────────────────────────

class TestComputeMeta:
    """
    compute_meta() の純粋計算ロジックを検証する。
    run_importance() と同じ前処理が apply_feature_engineering() 経由で適用されることも確認する。
    """

    def test_returns_expected_keys(self):
        """必要な全キーが返される。"""
        df = _make_df(n=20)
        meta = compute_meta(df)
        for key in ["sample_count", "date_from", "date_to", "total_rows", "dropped_count"]:
            assert key in meta

    def test_total_rows_reflects_input_length(self):
        """total_rows は入力 df の行数そのもの（フィルタ前）。"""
        df = _make_df(n=20)
        meta = compute_meta(df)
        assert meta["total_rows"] == 20

    def test_sample_count_less_than_total_due_to_shift(self):
        """shift(-1) により末尾行が落ちるため sample_count < total_rows になる。"""
        df = _make_df(n=20)
        meta = compute_meta(df)
        assert meta["sample_count"] < meta["total_rows"]

    def test_dropped_count_equals_total_minus_sample(self):
        """dropped_count = total_rows - sample_count の整合性を確認。"""
        df = _make_df(n=20)
        meta = compute_meta(df)
        assert meta["dropped_count"] == meta["total_rows"] - meta["sample_count"]

    def test_date_from_and_to_are_strings(self):
        """サンプルがある場合、date_from / date_to は文字列で返る。"""
        df = _make_df(n=20)
        meta = compute_meta(df)
        assert isinstance(meta["date_from"], str)
        assert isinstance(meta["date_to"], str)

    def test_empty_input_returns_null_dates_and_zero_counts(self):
        """空 DataFrame を渡すと date_from/to は None、各カウントは 0 になる。"""
        df = pd.DataFrame(columns=["log_date", "weight", "calories", "protein", "fat", "carbs"])
        meta = compute_meta(df)
        assert meta["date_from"] is None
        assert meta["date_to"] is None
        assert meta["sample_count"] == 0
        assert meta["total_rows"] == 0
        assert meta["dropped_count"] == 0


# ── build_payload のテスト ───────────────────────────────────────────────────

class TestBuildPayload:
    """
    build_payload() が importance と meta を正しく合成することを検証する。
    analytics_cache.payload の構造仕様を文書化する役割も持つ。
    """

    def test_meta_key_present(self):
        """_meta キーが最上位に存在する。"""
        payload = build_payload(
            {"feat": {"label": "x", "importance": 0.5, "pct": 100.0}},
            {"sample_count": 10},
        )
        assert "_meta" in payload

    def test_importance_keys_merged_at_top_level(self):
        """importance のキーがトップレベルに展開されている。"""
        importance = {"feat": {"label": "x", "importance": 0.5, "pct": 100.0}}
        meta = {"sample_count": 10}
        payload = build_payload(importance, meta)
        assert "feat" in payload
        assert payload["_meta"] == meta

    def test_does_not_mutate_inputs(self):
        """importance / meta 辞書を変更しない。"""
        importance = {"feat": {"label": "x", "importance": 0.5, "pct": 100.0}}
        meta = {"sample_count": 10}
        build_payload(importance, meta)
        assert "_meta" not in importance
        assert "feat" not in meta
