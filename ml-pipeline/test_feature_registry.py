"""
test_feature_registry.py — feature_registry.py の単体テスト

実行: pytest ml-pipeline/test_feature_registry.py -v
依存: 標準ライブラリのみ（pandas / xgboost 不要）
"""

import pytest

from feature_registry import (
    FEATURE_REGISTRY,
    EncoderHint,
    FeatureDef,
    FeatureDtype,
    TargetType,
    active_feature_cols,
    active_feature_labels,
    active_features,
    all_feature_labels,
)


# ── FeatureDtype のテスト ─────────────────────────────────────────────────────

class TestFeatureDtype:
    def test_values_are_strings(self):
        """Enum 値が str として機能する。"""
        assert FeatureDtype.NUMERIC == "numeric"
        assert FeatureDtype.BOOLEAN == "boolean"
        assert FeatureDtype.CATEGORY == "category"

    def test_all_members_defined(self):
        """3種類の dtype が定義されている。"""
        names = {m.name for m in FeatureDtype}
        assert names == {"NUMERIC", "BOOLEAN", "CATEGORY"}


# ── EncoderHint のテスト ──────────────────────────────────────────────────────

class TestEncoderHint:
    def test_values_are_strings(self):
        assert EncoderHint.PASSTHROUGH == "passthrough"
        assert EncoderHint.ORDINAL == "ordinal"
        assert EncoderHint.ONE_HOT == "one_hot"
        assert EncoderHint.TARGET_ENCODE == "target_encode"

    def test_all_members_defined(self):
        names = {m.name for m in EncoderHint}
        assert names == {"PASSTHROUGH", "ORDINAL", "ONE_HOT", "TARGET_ENCODE"}


# ── TargetType のテスト ───────────────────────────────────────────────────────

class TestTargetType:
    def test_next_day_change_value(self):
        assert TargetType.NEXT_DAY_CHANGE == "next_day_change"

    def test_at_least_one_member(self):
        assert len(list(TargetType)) >= 1


# ── FeatureDef のテスト ───────────────────────────────────────────────────────

class TestFeatureDef:
    def test_frozen_dataclass_immutable(self):
        """frozen=True のため、フィールドの書き換えが TypeError になる。"""
        feat = FeatureDef(
            name="test_col",
            label="テスト",
            dtype=FeatureDtype.NUMERIC,
            nullable=False,
            source_col="test_col",
        )
        with pytest.raises((TypeError, AttributeError)):
            feat.name = "other"  # type: ignore[misc]

    def test_default_encoder_hint_is_passthrough(self):
        """encoder_hint のデフォルトは PASSTHROUGH。"""
        feat = FeatureDef(
            name="x", label="x", dtype=FeatureDtype.NUMERIC,
            nullable=False, source_col="x",
        )
        assert feat.encoder_hint == EncoderHint.PASSTHROUGH

    def test_default_active_is_true(self):
        """active のデフォルトは True。"""
        feat = FeatureDef(
            name="x", label="x", dtype=FeatureDtype.NUMERIC,
            nullable=False, source_col="x",
        )
        assert feat.active is True

    def test_active_false(self):
        """active=False を明示できる。"""
        feat = FeatureDef(
            name="x", label="x", dtype=FeatureDtype.NUMERIC,
            nullable=False, source_col="x", active=False,
        )
        assert feat.active is False


# ── FEATURE_REGISTRY のテスト ─────────────────────────────────────────────────

class TestFeatureRegistry:
    def test_is_nonempty_list(self):
        """FEATURE_REGISTRY は空でないリスト。"""
        assert isinstance(FEATURE_REGISTRY, list)
        assert len(FEATURE_REGISTRY) > 0

    def test_all_entries_are_featuredef(self):
        """全エントリが FeatureDef インスタンス。"""
        for f in FEATURE_REGISTRY:
            assert isinstance(f, FeatureDef)

    def test_names_are_unique(self):
        """name は重複しない。"""
        names = [f.name for f in FEATURE_REGISTRY]
        assert len(names) == len(set(names))

    def test_active_features_include_current_xgboost_cols(self):
        """現在の XGBoost 特徴量 5 つが active=True で登録されている。"""
        active_names = {f.name for f in FEATURE_REGISTRY if f.active}
        expected = {"cal_lag1", "rolling_cal_7", "p_lag1", "f_lag1", "c_lag1"}
        assert expected.issubset(active_names)

    def test_inactive_features_have_future_candidates(self):
        """将来候補が active=False で登録されている。"""
        inactive_names = {f.name for f in FEATURE_REGISTRY if not f.active}
        # 睡眠・便通・トレーニング種別は将来候補として登録済み
        assert "sleep_hours" in inactive_names
        assert "had_bowel_movement" in inactive_names
        assert "training_type" in inactive_names

    def test_all_entries_have_nonempty_name_and_label(self):
        """name / label が空文字でない。"""
        for f in FEATURE_REGISTRY:
            assert f.name.strip() != "", f"empty name in {f}"
            assert f.label.strip() != "", f"empty label in {f}"

    def test_all_entries_have_nonempty_source_col(self):
        """source_col が空文字でない。"""
        for f in FEATURE_REGISTRY:
            assert f.source_col.strip() != "", f"empty source_col in {f}"


# ── active_features のテスト ──────────────────────────────────────────────────

class TestActiveFeatures:
    def test_returns_only_active_entries(self):
        """active=True のエントリのみ返す。"""
        result = active_features()
        assert all(f.active for f in result)

    def test_returns_list_of_featuredef(self):
        result = active_features()
        assert isinstance(result, list)
        for f in result:
            assert isinstance(f, FeatureDef)

    def test_count_matches_registry(self):
        expected = [f for f in FEATURE_REGISTRY if f.active]
        assert len(active_features()) == len(expected)


# ── active_feature_cols のテスト ──────────────────────────────────────────────

class TestActiveFeatureCols:
    def test_returns_list_of_strings(self):
        result = active_feature_cols()
        assert isinstance(result, list)
        assert all(isinstance(c, str) for c in result)

    def test_contains_current_xgboost_cols(self):
        cols = active_feature_cols()
        for col in ["cal_lag1", "rolling_cal_7", "p_lag1", "f_lag1", "c_lag1"]:
            assert col in cols

    def test_no_inactive_cols(self):
        """inactive な特徴量の name が含まれない。"""
        cols = set(active_feature_cols())
        for f in FEATURE_REGISTRY:
            if not f.active:
                assert f.name not in cols

    def test_order_matches_registry_order(self):
        """active_features() と同じ順序で name が並ぶ。"""
        expected = [f.name for f in FEATURE_REGISTRY if f.active]
        assert active_feature_cols() == expected


# ── active_feature_labels のテスト ────────────────────────────────────────────

class TestActiveFeatureLabels:
    def test_returns_dict(self):
        result = active_feature_labels()
        assert isinstance(result, dict)

    def test_keys_match_active_cols(self):
        assert set(active_feature_labels().keys()) == set(active_feature_cols())

    def test_values_are_nonempty_strings(self):
        for key, label in active_feature_labels().items():
            assert isinstance(label, str), f"{key}: label must be str"
            assert label.strip() != "", f"{key}: label must not be empty"

    def test_labels_have_no_internal_name_patterns(self):
        """ラベルに _lag1 / rolling_ などの内部名接尾辞が含まれない。"""
        for label in active_feature_labels().values():
            assert "_lag" not in label, f"internal suffix in label: {label!r}"
            assert "rolling_" not in label, f"internal prefix in label: {label!r}"


# ── all_feature_labels のテスト ───────────────────────────────────────────────

class TestAllFeatureLabels:
    def test_includes_inactive_features(self):
        """active=False のエントリも含む。"""
        all_labels = all_feature_labels()
        for f in FEATURE_REGISTRY:
            assert f.name in all_labels

    def test_superset_of_active_labels(self):
        active = active_feature_labels()
        all_labels = all_feature_labels()
        for key in active:
            assert key in all_labels
            assert all_labels[key] == active[key]

    def test_count_matches_registry(self):
        assert len(all_feature_labels()) == len(FEATURE_REGISTRY)
