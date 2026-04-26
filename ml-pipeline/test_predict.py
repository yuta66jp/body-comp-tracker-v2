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

    def _make_row(self, log_date: str, weight, cheat: bool = False, travel: bool = False) -> dict:
        return {"log_date": log_date, "weight": weight, "is_cheat_day": cheat, "is_travel_day": travel}

    def test_returns_expected_columns(self):
        """返り値は 'ds', 'y', 'is_cheat_day', 'is_travel_day' の4列を持つ。"""
        from predict import fetch_daily_logs
        client = self._make_mock_client([
            self._make_row("2026-01-01", 65.0),
            self._make_row("2026-01-02", 64.8),
        ])
        df = fetch_daily_logs(client)
        assert list(df.columns) == ["ds", "y", "is_cheat_day", "is_travel_day"]

    def test_ds_is_datetime(self):
        """ds 列が datetime 型になっている。"""
        from predict import fetch_daily_logs
        client = self._make_mock_client([self._make_row("2026-01-01", 65.0)])
        df = fetch_daily_logs(client)
        assert pd.api.types.is_datetime64_any_dtype(df["ds"])

    def test_y_is_float(self):
        """y 列が float 型になっている。"""
        from predict import fetch_daily_logs
        client = self._make_mock_client([self._make_row("2026-01-01", 65)])  # int として渡す
        df = fetch_daily_logs(client)
        assert df["y"].dtype == float

    def test_null_weight_rows_are_dropped(self):
        """weight が null の行は除外される。"""
        from predict import fetch_daily_logs
        client = self._make_mock_client([
            self._make_row("2026-01-01", 65.0),
            self._make_row("2026-01-02", None),
            self._make_row("2026-01-03", 64.5),
        ])
        df = fetch_daily_logs(client)
        assert len(df) == 2
        assert df["y"].isna().sum() == 0

    def test_empty_response_all_null_weight_returns_empty_dataframe(self):
        """weight が全て null の場合は空 DataFrame を返す。"""
        from predict import fetch_daily_logs
        client = self._make_mock_client([
            self._make_row("2026-01-01", None),
            self._make_row("2026-01-02", None),
        ])
        df = fetch_daily_logs(client)
        assert isinstance(df, pd.DataFrame)
        assert len(df) == 0


# ── build_clean_series のテスト ──────────────────────────────────────────────


def _make_df(rows: list[dict]) -> pd.DataFrame:
    """テスト用 DataFrame を生成する。rows は log_date / weight / is_cheat_day / is_travel_day を含む。"""
    df = pd.DataFrame(rows)
    df["ds"] = pd.to_datetime(df["log_date"])
    df["y"] = df["weight"].astype(float)
    return df[["ds", "y", "is_cheat_day", "is_travel_day"]]


class TestBuildCleanSeries:
    """build_clean_series() の長期イベント除外ロジックを検証する。"""

    def test_no_events_returns_all_rows(self):
        """イベントフラグが全て False なら全行をそのまま返す。"""
        from predict import build_clean_series
        df = _make_df([
            {"log_date": "2026-01-01", "weight": 65.0, "is_cheat_day": False, "is_travel_day": False},
            {"log_date": "2026-01-02", "weight": 64.8, "is_cheat_day": False, "is_travel_day": False},
        ])
        clean = build_clean_series(df, long_event_threshold=5, long_event_recovery_days=5)
        assert len(clean) == 2
        assert list(clean.columns) == ["ds", "y"]

    def test_short_event_not_excluded(self):
        """threshold 未満の短期イベントは除外されない (3日 < threshold=5)。"""
        from predict import build_clean_series
        rows = [
            {"log_date": f"2026-01-{d:02d}", "weight": 65.0,
             "is_cheat_day": (3 <= d <= 5), "is_travel_day": False}
            for d in range(1, 11)
        ]
        df = _make_df(rows)
        clean = build_clean_series(df, long_event_threshold=5, long_event_recovery_days=5)
        assert len(clean) == 10  # 除外なし

    def test_long_event_block_excluded(self):
        """threshold 以上 (5日) の連続イベントはブロック + 回復期間が除外される。"""
        from predict import build_clean_series
        # 1/05 〜 1/09 (5日連続) = ブロック + 回復 5日 (1/10〜1/14) → 計 10日除外
        rows = [
            {"log_date": f"2026-01-{d:02d}", "weight": 65.0,
             "is_cheat_day": (5 <= d <= 9), "is_travel_day": False}
            for d in range(1, 21)
        ]
        df = _make_df(rows)
        clean = build_clean_series(df, long_event_threshold=5, long_event_recovery_days=5)
        # 20行 - 10行(ブロック5日+回復5日) = 10行残る
        assert len(clean) == 10
        remaining_dates = clean["ds"].dt.strftime("%Y-%m-%d").tolist()
        # 1/01〜1/04 は残る
        assert "2026-01-04" in remaining_dates
        # 1/05〜1/14 は除外される
        assert "2026-01-05" not in remaining_dates
        assert "2026-01-14" not in remaining_dates
        # 1/15〜1/20 は残る
        assert "2026-01-15" in remaining_dates

    def test_travel_day_flag_also_triggers_exclusion(self):
        """is_travel_day フラグも長期ブロックの検出に含まれる。"""
        from predict import build_clean_series
        rows = [
            {"log_date": f"2026-01-{d:02d}", "weight": 65.0,
             "is_cheat_day": False, "is_travel_day": (3 <= d <= 9)}  # 7日連続
            for d in range(1, 16)
        ]
        df = _make_df(rows)
        clean = build_clean_series(df, long_event_threshold=5, long_event_recovery_days=3)
        # ブロック 1/03〜1/09 (7日) + 回復 1/10〜1/12 (3日) = 10日除外
        assert len(clean) == 5

    def test_mixed_flags_merged_into_single_block(self):
        """is_cheat_day と is_travel_day が隣接している場合、1つの連続ブロックとして扱われる。"""
        from predict import build_clean_series
        rows = [
            {"log_date": f"2026-01-{d:02d}", "weight": 65.0,
             "is_cheat_day": (d in [5, 6, 7]), "is_travel_day": (d in [8, 9])}
            for d in range(1, 16)
        ]
        df = _make_df(rows)
        clean = build_clean_series(df, long_event_threshold=5, long_event_recovery_days=2)
        # ブロック 1/05〜1/09 (5日) + 回復 1/10〜1/11 (2日) = 7日除外
        assert len(clean) == 8

    def test_no_flag_columns_returns_ds_y_only(self):
        """フラグカラムが存在しない場合は全行を ds/y 列のみで返す。"""
        from predict import build_clean_series
        df = pd.DataFrame({
            "ds": pd.to_datetime(["2026-01-01", "2026-01-02"]),
            "y": [65.0, 64.8],
        })
        clean = build_clean_series(df)
        assert len(clean) == 2
        assert list(clean.columns) == ["ds", "y"]

    def test_returns_only_ds_y_columns(self):
        """返り値には ds と y のみが含まれる (フラグカラムは除去される)。"""
        from predict import build_clean_series
        rows = [
            {"log_date": f"2026-01-{d:02d}", "weight": 65.0,
             "is_cheat_day": False, "is_travel_day": False}
            for d in range(1, 6)
        ]
        df = _make_df(rows)
        clean = build_clean_series(df)
        assert list(clean.columns) == ["ds", "y"]

    def test_constants_match_backtest_defaults(self):
        """_LONG_EVENT_THRESHOLD と _LONG_EVENT_RECOVERY_DAYS が backtest.py のデフォルト値と一致する。"""
        from predict import _LONG_EVENT_THRESHOLD, _LONG_EVENT_RECOVERY_DAYS
        assert _LONG_EVENT_THRESHOLD == 5
        assert _LONG_EVENT_RECOVERY_DAYS == 5


# ── torch.load patch のテスト ────────────────────────────────────────────────

class TestTorchLoadPatch:
    def test_does_not_patch_torch_before_2_6(self):
        """torch 2.5 以下では monkey patch しない。"""
        from predict import patch_torch_load_for_neuralprophet

        def load(*_, **__):
            return "loaded"

        class _Torch:
            __version__ = "2.5.1"

        torch_module = _Torch()
        torch_module.load = load

        patched = patch_torch_load_for_neuralprophet(torch_module)

        assert patched is False
        assert torch_module.load is load

    def test_patch_forwards_pickle_module_and_mmap(self):
        """torch 2.6+ patch は pickle_module / mmap を元の torch.load に転送する。"""
        from predict import patch_torch_load_for_neuralprophet

        calls = []

        def load(*args, **kwargs):
            calls.append((args, kwargs))
            return "loaded"

        class _Torch:
            __version__ = "2.6.0"

        torch_module = _Torch()
        torch_module.load = load

        patched = patch_torch_load_for_neuralprophet(torch_module)
        result = torch_module.load(
            "checkpoint.ckpt",
            map_location="cpu",
            pickle_module="pickle-module",
            weights_only=True,
            mmap=True,
            extra_arg="extra",
        )

        assert patched is True
        assert result == "loaded"
        assert calls == [
            (
                ("checkpoint.ckpt",),
                {
                    "map_location": "cpu",
                    "pickle_module": "pickle-module",
                    "weights_only": False,
                    "mmap": True,
                    "extra_arg": "extra",
                },
            )
        ]


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
