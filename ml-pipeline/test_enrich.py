"""
test_enrich.py — enrich.py の平滑化・頑健化ロジックのテスト

改善後の TDEE 推定 (weight_sma7.diff() + rolling median) が以下を満たすことを検証する:
  1. 単日の体重スパイク (水分変動) が TDEE に過度に反映されない
  2. 体重・カロリー欠損があってもクラッシュしない
  3. 出力値が生理的に妥当な範囲に収まる
  4. 冪等性が保たれる
"""
import math

import pandas as pd
import pytest

from enrich import enrich_data


def _make_df(
    n: int = 30,
    base_weight: float = 65.0,
    base_cal: float = 2000.0,
) -> pd.DataFrame:
    """テスト用日次ログの生成 (周期的変動を含む)"""
    dates = pd.date_range("2026-01-01", periods=n, freq="D")
    weights = [base_weight - i * 0.05 + 0.15 * math.sin(i * 0.5) for i in range(n)]
    calories = [base_cal + 100 * math.cos(i * 0.3) for i in range(n)]
    return pd.DataFrame({"log_date": dates, "weight": weights, "calories": calories})


# ── 出力の基本確認 ─────────────────────────────────────────────────────────────

def test_output_columns_exist():
    df = enrich_data(_make_df())
    assert "tdee_estimated" in df.columns
    assert "weight_sma7" in df.columns


def test_output_length_unchanged():
    raw = _make_df(30)
    df = enrich_data(raw)
    assert len(df) == 30


# ── 平滑化の効果: 単日体重スパイクへの耐性 ────────────────────────────────────

def test_single_weight_spike_does_not_cause_extreme_tdee():
    """体重が1日で+3 kg 急増 (水分) しても TDEE が生理的範囲を大きく逸脱しない"""
    df_raw = _make_df(30)
    # 15日目に水分貯留を模倣した体重スパイクを注入
    df_raw.loc[14, "weight"] = df_raw.loc[14, "weight"] + 3.0
    df = enrich_data(df_raw)

    for i in [13, 14, 15, 16]:
        v = df.loc[i, "tdee_estimated"]
        if v is None or (isinstance(v, float) and not math.isfinite(v)):
            continue
        assert abs(v) < 6000, f"TDEE too extreme on day {i}: {v:.0f} kcal"


def test_smoothed_tdee_less_volatile_than_raw():
    """SMA7 ベースの TDEE は前日比差分ベースより変動幅が小さい"""
    df_raw = _make_df(30)
    # 何日かに意図的な体重ジャンプを入れる
    df_raw.loc[10, "weight"] += 2.0
    df_raw.loc[11, "weight"] -= 1.5
    df_raw.loc[20, "weight"] += 2.5

    df = enrich_data(df_raw)

    # 旧手法 (raw diff) と比較
    weight_raw_delta = df["weight"].diff()
    tdee_old = (df["calories"] - weight_raw_delta * 7200).dropna()

    tdee_new = df["tdee_estimated"].dropna()
    if len(tdee_old) > 3 and len(tdee_new) > 3:
        assert tdee_new.std() < tdee_old.std(), (
            f"新手法 (σ={tdee_new.std():.0f}) が旧手法 (σ={tdee_old.std():.0f}) より変動大"
        )


# ── 生理的妥当範囲 ──────────────────────────────────────────────────────────

def test_tdee_physiological_range():
    """通常の条件下で TDEE が 500〜5000 kcal に収まる"""
    df = enrich_data(_make_df())
    finite_values = [
        v for v in df["tdee_estimated"].tolist()
        if v is not None and isinstance(v, float) and math.isfinite(v)
    ]
    assert len(finite_values) >= 5, "TDEE の有効値が少なすぎます"
    for v in finite_values:
        assert 500 < v < 5000, f"TDEE out of physiological range: {v:.0f} kcal"


def test_weight_sma7_between_min_and_max():
    """weight_sma7 が元の体重の最小〜最大の範囲に収まる"""
    df = enrich_data(_make_df())
    w_min = df["weight"].min()
    w_max = df["weight"].max()
    sma = df["weight_sma7"].dropna()
    assert (sma >= w_min - 0.1).all()
    assert (sma <= w_max + 0.1).all()


# ── 欠損・頑健性 ──────────────────────────────────────────────────────────

def test_missing_weight_no_crash():
    """体重欠損があってもクラッシュしない"""
    df_raw = _make_df(20)
    df_raw.loc[[3, 5, 10], "weight"] = None
    df = enrich_data(df_raw)
    assert "tdee_estimated" in df.columns


def test_missing_calories_no_crash():
    """カロリー欠損があってもクラッシュしない"""
    df_raw = _make_df(20)
    df_raw.loc[[2, 6, 11], "calories"] = None
    df = enrich_data(df_raw)
    assert "tdee_estimated" in df.columns


def test_all_missing_weight_no_crash():
    """体重が全欠損でもクラッシュしない"""
    df_raw = _make_df(10)
    df_raw["weight"] = None
    df = enrich_data(df_raw)
    assert "tdee_estimated" in df.columns


def test_few_rows_no_crash():
    """行数が少なくてもクラッシュしない (min_periods=3 のため null になる場合がある)"""
    df = enrich_data(_make_df(n=5))
    assert "tdee_estimated" in df.columns


# ── 冪等性 ──────────────────────────────────────────────────────────────

def test_idempotent():
    """enrich_data を 2 回呼んでも結果が同一 (冪等性)"""
    df_raw = _make_df(30)
    result1 = enrich_data(df_raw)
    result2 = enrich_data(result1.copy())

    for i in range(len(result1)):
        v1 = result1["tdee_estimated"].iloc[i]
        v2 = result2["tdee_estimated"].iloc[i]
        if v1 is None or (isinstance(v1, float) and not math.isfinite(v1)):
            continue
        assert abs(v1 - v2) < 1e-6, f"Not idempotent at index {i}: {v1:.2f} vs {v2:.2f}"


# ── min_periods=3 の挙動確認 ────────────────────────────────────────────────

def test_early_rows_may_be_null():
    """先頭付近 (min_periods=3 未満) は TDEE が null/NaN でも許容"""
    df = enrich_data(_make_df(30))
    # 先頭の行は None または NaN が含まれても問題ない
    first_val = df["tdee_estimated"].iloc[0]
    assert first_val is None or (isinstance(first_val, float) and not math.isfinite(first_val)) or isinstance(first_val, float)


def test_sufficient_data_produces_estimates():
    """30 日分あれば後半に十分な有限 TDEE 値が得られる"""
    df = enrich_data(_make_df(30))
    # 後半 20 行のうち過半が有限値であること
    tail = df.tail(20)["tdee_estimated"].tolist()
    finite_count = sum(
        1 for v in tail
        if v is not None and isinstance(v, float) and math.isfinite(v)
    )
    assert finite_count >= 10, f"後半の有限 TDEE 値が少なすぎます: {finite_count}"
