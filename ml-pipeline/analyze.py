"""
analyze.py — XGBoost 因子分析バッチ
旧: logic.py の run_xgboost_importance() を移植

■ 目的変数 (target):
    翌日体重変化量 = weight(t+1) - weight(t)
    符号: 増加を正、減少を負。
    current_weight を説明変数から除外してリーケージを防ぐ。

■ 特徴量:
    feature_registry.py の FEATURE_REGISTRY (active=True) から動的取得する。
    特徴量の追加・変更は feature_registry.py のみを編集すること。
    FEATURE_COLS を analyze.py に直書きしない。

■ 出力:
    結果は analytics_cache.payload (JSONB) に保存する。

実行: python ml-pipeline/analyze.py

■ モジュール構成 (責務分離):
    トップレベル import: 軽量標準ライブラリ + pandas のみ
    xgboost  : run_importance() 内で遅延 import（分析実行時のみ必要）
    supabase : main() 内で遅延 import（I/O 実行時のみ必要）

    純粋ロジック層 (ファイル I/O・外部依存なし):
        apply_feature_engineering() — 欠損除去・特徴量計算・target 計算
        run_importance()            — XGBoost 学習・重要度算出
        compute_stability()        — Bootstrap による feature importance 安定性算出
        compute_meta()             — サンプル数・日付範囲などの前提情報算出
        build_payload()            — importance + meta + stability → analytics_cache 形式へ合成

    外部 I/O 層 (supabase 依存):
        fetch_daily_logs()         — daily_logs テーブルから全件取得
        save_analytics_cache()     — analytics_cache テーブルへ upsert

    実行入口:
        main()                     — 環境変数解決・エラーハンドリング・各層の呼び出し
"""

import logging
import os
from datetime import datetime, timezone

import pandas as pd

from feature_registry import (
    TargetType,
    active_feature_cols,
    active_feature_labels,
    active_features,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# feature_registry.py から動的取得。直書きしない。
FEATURE_COLS = active_feature_cols()

# ── stability 定義 ────────────────────────────────────────────────────────────
# N_BOOTSTRAP 回のリサンプリングで XGBoost を再学習し、各 feature の
# importance（feature_importances_）を収集する。
# 各 feature の importance の変動係数（CV = std / mean）を stability_cv とする。
#
# stability ラベル（経験則ベース。将来 A/B 比較や交差検証で検証予定）:
#   CV < 0.3  → "high"   (再現性が高い)
#   CV < 0.6  → "medium" (中程度のばらつき)
#   CV >= 0.6 → "low"    (ばらつきが大きく解釈に注意)
#
# データ不足・ブートストラップが成立しない場合:
#   → stability = "unavailable"
#     (importance は表示するが stability は提供しない)
N_BOOTSTRAP = 20  # bootstrap 反復数。少なすぎると CV が不安定、多すぎると重い
MIN_ROWS = 14


# ── 純粋ロジック層 ─────────────────────────────────────────────────────────────


def apply_feature_engineering(
    df: pd.DataFrame,
    target_type: TargetType = TargetType.NEXT_DAY_CHANGE,
) -> pd.DataFrame:
    """欠損除去・ソート・特徴量エンジニアリング・target 計算を適用した DataFrame を返す。

    run_importance() と compute_meta() の両方がこの関数を経由することで、
    特徴量エンジニアリングのロジックをここに一元化する。

    返す DataFrame の末尾 1 行は target が NaN（shift(-1) によるもの）。
    呼び出し側で dropna(subset=FEATURE_COLS + ["target"]) を行うこと。

    入力 df を変更しない（内部で copy する）。
    xgboost / supabase を必要としない純粋変換。

    Args:
        df:          daily_logs の生 DataFrame。
        target_type: 目的変数の種類。TargetType.NEXT_DAY_CHANGE のみ実装済み。
                     新しい target_type は feature_registry.TargetType に追加してから
                     ここに分岐を追加すること。
    """
    df = df.copy()
    df = df.dropna(subset=["weight", "calories", "protein", "fat", "carbs"])
    df = df.sort_values("log_date").reset_index(drop=True)

    df["cal_lag1"]      = df["calories"]
    df["rolling_cal_7"] = df["calories"].rolling(window=7, min_periods=1).mean()
    df["p_lag1"]        = df["protein"]
    df["f_lag1"]        = df["fat"]
    df["c_lag1"]        = df["carbs"]

    # ── 目的変数 ─────────────────────────────────────────────────────────────
    if target_type == TargetType.NEXT_DAY_CHANGE:
        # 翌日体重変化量 = weight(t+1) - weight(t)
        # 「翌日体重の絶対値」ではなく「翌日の変化量（増加=正、減少=負）」を予測する。
        # current_weight は説明変数から除外済み（リーケージ回避）。
        df["target"] = df["weight"].shift(-1) - df["weight"]
    else:
        raise ValueError(f"未実装の target_type: {target_type!r}")

    return df


def run_importance(df: pd.DataFrame) -> dict[str, dict[str, float | str]]:
    """XGBoost で特徴量重要度を計算して返す。

    xgboost はこの関数内で遅延 import する（分析実行時のみ必要）。
    import analyze 時に xgboost が要求されないよう意図的に遅延させている。

    Returns:
        特徴量名をキーとする辞書。各値は以下のキーを持つ辞書:
        - label (str): 日本語ラベル
        - importance (float): XGBoost の feature_importances_ の生値（0〜1）
        - pct (float): 全特徴量合計に対する割合（%）

    Raises:
        ValueError: 有効行数が MIN_ROWS 未満のとき
    """
    try:
        import xgboost as xgb  # 遅延 import: 分析実行時のみ必要
    except ImportError as e:
        raise ImportError(
            "xgboost が未導入です。pip install xgboost でインストールしてください。"
        ) from e

    df = apply_feature_engineering(df)
    df = df.dropna(subset=FEATURE_COLS + ["target"])

    if len(df) < MIN_ROWS:
        raise ValueError(f"有効行数が不足 ({len(df)} < {MIN_ROWS})")

    X = df[FEATURE_COLS].values
    y = df["target"].values

    model = xgb.XGBRegressor(n_estimators=100, max_depth=3, random_state=42, verbosity=0)
    model.fit(X, y)

    raw = dict(zip(FEATURE_COLS, model.feature_importances_.tolist()))

    # ラベルと重要度（%）を合わせて返す
    labels = active_feature_labels()
    total = sum(raw.values()) or 1.0
    return {
        col: {
            "label": labels[col],
            "importance": round(raw[col], 6),
            "pct": round(raw[col] / total * 100, 1),
        }
        for col in FEATURE_COLS
    }


def compute_stability(
    df: pd.DataFrame,
    n_bootstrap: int = N_BOOTSTRAP,
) -> dict[str, dict[str, float | str]]:
    """Bootstrap による feature importance の安定性を算出する。

    各 bootstrap サンプルで XGBoost を再学習し、
    feature importance の変動係数 (CV = std / mean) から stability ラベルを導出する。

    Returns:
        特徴量名をキーとする辞書。各値は:
        - stability (str): "high" / "medium" / "low" / "unavailable"
        - cv (float | None): 変動係数。"unavailable" の場合は None
    """
    import math as _math

    try:
        import numpy as np
        import xgboost as xgb  # 遅延 import: 分析実行時のみ必要
    except ImportError:
        return {col: {"stability": "unavailable", "cv": None} for col in FEATURE_COLS}

    df_proc = apply_feature_engineering(df)
    df_proc = df_proc.dropna(subset=FEATURE_COLS + ["target"])

    if len(df_proc) < MIN_ROWS:
        return {col: {"stability": "unavailable", "cv": None} for col in FEATURE_COLS}

    X = df_proc[FEATURE_COLS].values
    y = df_proc["target"].values
    n = len(X)

    # bootstrap ごとの importance を収集する
    boot_importances: list[list[float]] = [[] for _ in FEATURE_COLS]

    rng = np.random.default_rng(seed=42)
    for _ in range(n_bootstrap):
        idx = rng.integers(0, n, size=n)
        X_boot = X[idx]
        y_boot = y[idx]
        # bootstrap サンプルに定数 target しかない場合はスキップ
        if np.std(y_boot) == 0:
            continue
        model = xgb.XGBRegressor(
            n_estimators=100, max_depth=3, random_state=42, verbosity=0
        )
        model.fit(X_boot, y_boot)
        for j, imp in enumerate(model.feature_importances_.tolist()):
            boot_importances[j].append(imp)

    result: dict[str, dict[str, float | str]] = {}
    for j, col in enumerate(FEATURE_COLS):
        samples = boot_importances[j]
        if len(samples) < 2:
            result[col] = {"stability": "unavailable", "cv": None}
            continue
        mean = float(np.mean(samples))
        std = float(np.std(samples, ddof=1))
        if mean == 0:
            # mean=0 は全 bootstrap で重要度 0 → 安定しているとも言えるが
            # CV が定義できないため "unavailable" とする
            result[col] = {"stability": "unavailable", "cv": None}
            continue
        cv = std / mean
        if not _math.isfinite(cv) or cv < 0:
            result[col] = {"stability": "unavailable", "cv": None}
            continue
        cv_rounded = round(cv, 6)
        if cv < 0.3:
            label = "high"
        elif cv < 0.6:
            label = "medium"
        else:
            label = "low"
        result[col] = {"stability": label, "cv": cv_rounded}

    return result


def compute_feature_coverage(df: pd.DataFrame) -> dict[str, float]:
    """アクティブな特徴量ごとのソース列の非欠損率を返す。

    apply_feature_engineering() 前の生 DataFrame を渡すこと。
    フィルタ後の df では全列が non-null になるため意味がない。

    Returns:
        {feature_name: coverage_rate} の辞書。coverage_rate は 0.0〜1.0 の float。
        入力 df が空の場合は全特徴量が 0.0 になる。
    """
    n = len(df)
    if n == 0:
        return {f.name: 0.0 for f in active_features()}
    result: dict[str, float] = {}
    for feat in active_features():
        if feat.source_col in df.columns:
            coverage = float(df[feat.source_col].notna().sum()) / n
        else:
            coverage = 0.0
        result[feat.name] = round(coverage, 4)
    return result


def compute_meta(
    df: pd.DataFrame,
    target_type: TargetType = TargetType.NEXT_DAY_CHANGE,
) -> dict[str, object]:
    """分析前提情報（サンプル数・日付範囲・除外数・特徴量情報）を計算して返す。

    apply_feature_engineering() 経由で run_importance() と同じ前処理を参照する。
    xgboost / supabase を必要としない純粋関数。

    Returns:
        _meta キー向けの辞書:
        - sample_count (int): 有効サンプル数（欠損除外 + shift(-1) 末尾除外後）
        - date_from (str | None): 有効サンプルの最古日付。サンプルなしなら None
        - date_to (str | None): 有効サンプルの最新日付。サンプルなしなら None
        - total_rows (int): 入力 df の行数（フィルタ前）
        - dropped_count (int): 欠損除外 + shift(-1) 末尾除外の合計
        - feature_labels (dict[str, str]): {feature_name: label}。フロントの fallback 用。
        - feature_coverage (dict[str, float]): {feature_name: 非欠損率 0.0〜1.0}
        - target_type (str): 使用した目的変数の種類（TargetType の値）
    """
    total_rows = int(len(df))
    df_proc = apply_feature_engineering(df, target_type=target_type)
    df_proc = df_proc.dropna(subset=FEATURE_COLS + ["target"])
    sample_count = int(len(df_proc))
    return {
        "sample_count":     sample_count,
        "date_from":        str(df_proc["log_date"].iloc[0])  if sample_count > 0 else None,
        "date_to":          str(df_proc["log_date"].iloc[-1]) if sample_count > 0 else None,
        "total_rows":       total_rows,
        "dropped_count":    total_rows - sample_count,
        "feature_labels":   active_feature_labels(),
        "feature_coverage": compute_feature_coverage(df),
        "target_type":      target_type.value,
    }


def build_payload(importance: dict, meta: dict, stability: dict | None = None) -> dict:
    """importance と meta と stability を analytics_cache.payload 形式に合成する。

    Returns:
        {"_meta": meta, **importance} に stability を渡した場合は "_stability" キーも付与する。
    """
    payload = {"_meta": meta, **importance}
    if stability is not None:
        payload["_stability"] = stability
    return payload


# ── 外部 I/O 層 ───────────────────────────────────────────────────────────────


def fetch_daily_logs(client) -> pd.DataFrame:
    """Supabase から daily_logs を全件取得して DataFrame で返す。"""
    response = client.table("daily_logs").select("*").order("log_date").execute()
    return pd.DataFrame(response.data)


def save_analytics_cache(client, metric_type: str, payload: dict) -> None:
    """analytics_cache テーブルに payload を upsert する。"""
    client.table("analytics_cache").upsert(
        {
            "metric_type": metric_type,
            "payload": payload,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
    ).execute()


# ── 実行入口 ──────────────────────────────────────────────────────────────────


def main() -> None:
    try:
        from supabase import create_client  # 遅延 import: I/O 実行時のみ必要
    except ImportError as e:
        raise ImportError(
            "supabase が未導入です。pip install supabase でインストールしてください。"
        ) from e

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        logger.error(
            "Missing required environment variables: SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY"
        )
        raise SystemExit(1)

    client = create_client(url, key)

    logger.info("Fetching daily_logs...")
    try:
        df = fetch_daily_logs(client)
    except Exception as e:
        logger.error("Failed to fetch daily_logs: %s", e)
        raise SystemExit(1)

    logger.info("Fetched %d rows from daily_logs.", len(df))

    if len(df) < MIN_ROWS:
        logger.warning("Insufficient data (%d rows). Skipping analysis.", len(df))
        return

    logger.info("Running XGBoost importance (rows=%d)...", len(df))
    try:
        importance = run_importance(df)
    except ValueError as e:
        logger.warning("Skipping: %s", e)
        return
    except Exception as e:
        logger.error("XGBoost training failed: %s", e)
        raise SystemExit(1)

    logger.info("Importance: %s", importance)

    logger.info("Running bootstrap stability (n_bootstrap=%d)...", N_BOOTSTRAP)
    try:
        stability = compute_stability(df)
    except Exception as e:
        logger.warning("Bootstrap stability failed, skipping: %s", e)
        stability = None

    logger.info("Stability: %s", stability)

    meta = compute_meta(df)
    payload = build_payload(importance, meta, stability)

    logger.info("Saving xgboost_importance to 'analytics_cache'...")
    try:
        save_analytics_cache(client, "xgboost_importance", payload)
    except Exception as e:
        logger.error("Failed to save analytics_cache: %s", e)
        raise SystemExit(1)

    logger.info("Done. Saved xgboost_importance to 'analytics_cache'.")


if __name__ == "__main__":
    main()
