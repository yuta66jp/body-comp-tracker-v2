import importlib.util
from pathlib import Path

import pytest


MODULE_PATH = Path(__file__).with_name("import_history.py")
SPEC = importlib.util.spec_from_file_location("import_history", MODULE_PATH)
assert SPEC is not None and SPEC.loader is not None
import_history = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(import_history)


def test_build_season_summaries_uses_first_and_last_weight() -> None:
    records = [
        {
            "log_date": "2026-03-31",
            "weight": 70.0,
            "season": "2026_Cut",
            "target_date": "2026-04-01",
        },
        {
            "log_date": "2026-01-01",
            "weight": 75.0,
            "season": "2026_Cut",
            "target_date": "2026-04-01",
        },
        {
            "log_date": "2026-02-01",
            "weight": 72.0,
            "season": "2026_Cut",
            "target_date": "2026-04-01",
        },
    ]

    summary = import_history.build_season_summaries(records)["2026_Cut"]

    assert summary["start_date"] == "2026-01-01"
    assert summary["start_weight"] == 75.0
    assert summary["end_date"] == "2026-03-31"
    assert summary["end_weight"] == 70.0
    assert summary["min_weight"] == 70.0


def test_build_season_summaries_rejects_multiple_target_dates() -> None:
    records = [
        {
            "log_date": "2026-01-01",
            "weight": 75.0,
            "season": "2026_Cut",
            "target_date": "2026-04-01",
        },
        {
            "log_date": "2026-02-01",
            "weight": 72.0,
            "season": "2026_Cut",
            "target_date": "2026-05-01",
        },
    ]

    with pytest.raises(ValueError, match="multiple target dates"):
        import_history.build_season_summaries(records)


def test_require_owner_user_id_requires_valid_uuid(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("SUPABASE_OWNER_USER_ID", raising=False)
    with pytest.raises(ValueError, match="is required"):
        import_history.require_owner_user_id()

    monkeypatch.setenv("SUPABASE_OWNER_USER_ID", "not-a-uuid")
    with pytest.raises(ValueError, match="must be a UUID"):
        import_history.require_owner_user_id()

    monkeypatch.setenv(
        "SUPABASE_OWNER_USER_ID",
        "11111111-1111-1111-1111-111111111111",
    )
    assert (
        import_history.require_owner_user_id()
        == "11111111-1111-1111-1111-111111111111"
    )
