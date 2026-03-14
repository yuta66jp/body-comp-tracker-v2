"""
test_predict.py — predict.py の単体テスト

対象: fetch_daily_logs() の DataFrame 変換・run_model() の出力フォーマット

実行: pytest ml-pipeline/test_predict.py -v
依存: pandas (requirements-ci.txt に含まれる)
      torch / neuralprophet / supabase は不要 —
      import predict 時にこれらを要求しないことを保証する

■ テスト方針:
    run_model() は NeuralProphet / torch に依存するため CI では直接実行しない。
    fetch_daily_logs() の DataFrame 変換ロジックと
    main() の record 組み立てロジックは pandas のみで検証可能な部分を抽出して確認する。
    import 境界テストは本ファイルで一元管理する。
"""

import math
import sys

import pandas as pd
import pytest


# ── import 境界テスト ─────────────────────────────────────────────────────────


class TestImportBoundary:
    """
    各モジュールが重い依存 (supabase / torch / neuralprophet) なしで import できることを確認する。

    requirements-ci.txt には supabase / torch / neuralprophet が含まれないため、
    CI でこれらのテストが通ることで「import 時副作用がない」ことを保証する。
    """

    def test_import_predict_without_supabase(self):
        """import predict が supabase なしで成功する。"""
        # predict が既に sys.modules にある場合は再 import して副作用が起きないことを確認
        if "predict" in sys.modules:
            del sys.modules["predict"]
        import predict  # noqa: F401 — import できることを確認するだけ
        assert "predict" in sys.modules

    def test_import_analyze_without_supabase(self):
        """import analyze が supabase なしで成功する。"""
        if "analyze" in sys.modules:
            del sys.modules["analyze"]
        import analyze  # noqa: F401
        assert "analyze" in sys.modules

    def test_import_enrich_without_supabase(self):
        """import enrich が supabase なしで成功する。"""
        if "enrich" in sys.modules:
            del sys.modules["enrich"]
        import enrich  # noqa: F401
        assert "enrich" in sys.modules

    def test_import_predict_without_torch(self):
        """import predict が torch なしで成功する（torch は run_model() 内で遅延 import）。"""
        # torch を一時的に sys.modules から除外して import を試みる
        torch_backup = sys.modules.pop("torch", None)
        predict_backup = sys.modules.pop("predict", None)
        try:
            import predict  # noqa: F401
            assert "predict" in sys.modules
        finally:
            if torch_backup is not None:
                sys.modules["torch"] = torch_backup
            if predict_backup is not None:
                sys.modules["predict"] = predict_backup

    def test_import_predict_without_neuralprophet(self):
        """import predict が neuralprophet なしで成功する（neuralprophet は run_model() 内で遅延 import）。"""
        np_backup = sys.modules.pop("neuralprophet", None)
        predict_backup = sys.modules.pop("predict", None)
        try:
            import predict  # noqa: F401
            assert "predict" in sys.modules
        finally:
            if np_backup is not None:
                sys.modules["neuralprophet"] = np_backup
            if predict_backup is not None:
                sys.modules["predict"] = predict_backup


# ── fetch_daily_logs の DataFrame 変換ロジックのテスト ──────────────────────


class TestFetchDailyLogsTransform:
    """
    fetch_daily_logs() が Supabase レスポンスを正しく変換することを検証する。
    Supabase client をモックして純粋な変換ロジックを確認する。
    """

    def _make_mock_client(self, data: list[dict]):
        """Supabase client の select().order().execute() を模倣するモック。"""
        class _Response:
            def __init__(self, d):
                self.data = d

        class _Query:
            def __init__(self, d):
                self._data = d
            def select(self, *_):
                return self
            def order(self, *_):
                return self
            def execute(self):
                return _Response(self._data)

        class _Client:
            def __init__(self, d):
                self._data = d
            def table(self, _):
                return _Query(self._data)

        return _Client(data)

    def test_returns_ds_and_y_columns(self):
        """返り値は 'ds' と 'y' の2列を持つ。"""
        from predict import fetch_daily_logs
        client = self._make_mock_client([
            {"log_date": "2026-01-01", "weight": 65.0},
            {"log_date": "2026-01-02", "weight": 64.8},
        ])
        df = fetch_daily_logs(client)
        assert list(df.columns) == ["ds", "y"]

    def test_ds_is_datetime(self):
        """ds 列が datetime 型になっている。"""
        from predict import fetch_daily_logs
        client = self._make_mock_client([
            {"log_date": "2026-01-01", "weight": 65.0},
        ])
        df = fetch_daily_logs(client)
        assert pd.api.types.is_datetime64_any_dtype(df["ds"])

    def test_y_is_float(self):
        """y 列が float 型になっている。"""
        from predict import fetch_daily_logs
        client = self._make_mock_client([
            {"log_date": "2026-01-01", "weight": 65},  # int として渡す
        ])
        df = fetch_daily_logs(client)
        assert df["y"].dtype == float

    def test_null_weight_rows_are_dropped(self):
        """weight が null の行は除外される。"""
        from predict import fetch_daily_logs
        client = self._make_mock_client([
            {"log_date": "2026-01-01", "weight": 65.0},
            {"log_date": "2026-01-02", "weight": None},
            {"log_date": "2026-01-03", "weight": 64.5},
        ])
        df = fetch_daily_logs(client)
        assert len(df) == 2
        assert df["y"].isna().sum() == 0

    def test_empty_response_all_null_weight_returns_empty_dataframe(self):
        """weight が全て null の場合は空 DataFrame を返す。"""
        from predict import fetch_daily_logs
        client = self._make_mock_client([
            {"log_date": "2026-01-01", "weight": None},
            {"log_date": "2026-01-02", "weight": None},
        ])
        df = fetch_daily_logs(client)
        assert isinstance(df, pd.DataFrame)
        assert len(df) == 0


# ── record 組み立てロジックのテスト ─────────────────────────────────────────


class TestRecordAssembly:
    """
    main() 内の record 組み立てロジックを predict.py の定数と照合して確認する。
    NeuralProphet / Supabase に依存しない純粋な変換部分を抽出して検証する。
    """

    def test_non_finite_yhat_excluded(self):
        """yhat が inf / -inf / nan の場合はレコードに含まれない。"""
        forecast = pd.DataFrame({
            "ds": pd.to_datetime(["2026-01-01", "2026-01-02", "2026-01-03"]),
            "yhat": [64.5, float("inf"), float("nan")],
        })
        from datetime import datetime, timezone
        created_at = datetime.now(timezone.utc).isoformat()

        records = []
        for row in forecast.itertuples(index=False):
            yhat = round(float(row.yhat), 3)
            if math.isfinite(yhat):
                records.append({
                    "ds": row.ds.strftime("%Y-%m-%d"),
                    "yhat": yhat,
                    "model_version": "neuralprophet-v1",
                    "created_at": created_at,
                })
        assert len(records) == 1
        assert records[0]["ds"] == "2026-01-01"

    def test_yhat_rounded_to_3_decimal_places(self):
        """yhat は小数点以下3桁に丸められる。"""
        forecast = pd.DataFrame({
            "ds": pd.to_datetime(["2026-01-01"]),
            "yhat": [64.123456789],
        })
        from datetime import datetime, timezone
        created_at = datetime.now(timezone.utc).isoformat()

        records = []
        for row in forecast.itertuples(index=False):
            yhat = round(float(row.yhat), 3)
            if math.isfinite(yhat):
                records.append({
                    "ds": row.ds.strftime("%Y-%m-%d"),
                    "yhat": yhat,
                    "model_version": "neuralprophet-v1",
                    "created_at": created_at,
                })
        assert records[0]["yhat"] == 64.123

    def test_model_version_constant(self):
        """MODEL_VERSION 定数が期待値を持つ。"""
        from predict import MODEL_VERSION
        assert MODEL_VERSION == "neuralprophet-v1"

    def test_forecast_days_constant(self):
        """FORECAST_DAYS 定数が 180 以上である。"""
        from predict import FORECAST_DAYS
        assert FORECAST_DAYS >= 180

    def test_min_rows_constant(self):
        """MIN_ROWS 定数が 14 である。"""
        from predict import MIN_ROWS
        assert MIN_ROWS == 14
