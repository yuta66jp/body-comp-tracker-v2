"""
enrich.py — TDEE逆算・SMA計算・データ加工バッチ
旧: logic.py の enrich_data() を移植

実行: python ml-pipeline/enrich.py

■ モジュール構成 (責務分離):
    トップレベル import: 軽量標準ライブラリ + numpy + pandas のみ
    supabase : main() 内で遅延 import（I/O 実行時のみ必要）

    純粋ロジック層 (ファイル I/O・外部依存なし):
        enrich_data()             — SMA7・TDEE逆算計算
        build_enriched_payload()  — enriched DataFrame → analytics_cache 形式

    外部 I/O 層 (supabase 依存):
        fetch_daily_logs()        — daily_logs テーブルから全件取得
        save_analytics_cache()    — analytics_cache テーブルへ upsert

    実行入口:
        main()                    — 環境変数解決・エラーハンドリング・各層の呼び出し

── TDEE 推定仕様 ────────────────────────────────────────────────────────────
canonical source: このファイル (batch)
window:  SMA_WINDOW = 7 日 (weight_sma7.diff() ベース)
平滑化:  weight_sma7.diff() + rolling median (min_periods=3)
係数:    KCAL_PER_KG_FAT = 7200 kcal/kg (Hall et al., 2012)
front 側でこの値を再計算・再平滑化しないこと。
front は analytics_cache["enriched_logs"] の tdee_estimated を表示・fallback・整形するだけにすること。
─────────────────────────────────────────────────────────────────────────────
"""

import logging
import math
import os
from datetime import datetime, timezone

import numpy as np
import pandas as pd

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

KCAL_PER_KG_FAT = 7_200  # Hall et al., 2012 (旧6800から統一)
SMA_WINDOW = 7


# ── 純粋ロジック層 ─────────────────────────────────────────────────────────────


def enrich_data(df: pd.DataFrame) -> pd.DataFrame:
    """TDEE逆算・SMA等を追加して返す。冪等性のため既存列を先に削除する。"""
    for col in ["weight_sma7", "tdee_estimated"]:
        if col in df.columns:
            df = df.drop(columns=[col])

    df = df.copy()
    df["log_date"] = pd.to_datetime(df["log_date"])
    df = df.sort_values("log_date").reset_index(drop=True)

    # 7日間単純移動平均
    df["weight_sma7"] = df["weight"].rolling(window=SMA_WINDOW, min_periods=1).mean()

    # TDEE逆算 — 平滑化済み体重推移を使って単日ノイズを除去する
    #
    # 従来: weight.diff() を使用 → 水分・塩分・便通で±2 kg 変動すると TDEE が±14,400 kcal 乱高下
    # 改善: weight_sma7.diff() = 7日移動平均の差分
    #       SMA7 の差分は 1 日分の変化が 1/7 に分散されるため、短期ノイズに強い
    #       さらに rolling median (min_periods=3) で外れ値日のカロリー記録を平滑化する
    weight_sma7_delta = df["weight_sma7"].diff()  # kg/day (SMA7 の差分: ≒ (w_t - w_{t-6}) / 6)
    tdee_candidates = df["calories"] - weight_sma7_delta * KCAL_PER_KG_FAT
    df["tdee_estimated"] = tdee_candidates.rolling(
        window=SMA_WINDOW, min_periods=3
    ).median()

    return df


def build_enriched_payload(df: pd.DataFrame) -> list[dict]:
    """enrich_data() 済みの DataFrame を analytics_cache.payload 形式のリストに変換する。

    log_date を "YYYY-MM-DD" 文字列、inf / NaN を None に正規化する。
    入力 df を変更しない。supabase を必要としない純粋変換。

    生成フィールド:
      - log_date        : YYYY-MM-DD 文字列
      - weight_sma7     : 7日単純移動平均体重 (kg)
      - tdee_estimated  : 推定 TDEE (kcal/日)。canonical source はこのバッチ。
      - avg_tdee_7d     : 後方 SMA_WINDOW 日の推定 TDEE 平均 (kcal/日)
                          front 側で再平均しなくてよいように事前計算する。
      - avg_calories_7d : 後方 SMA_WINDOW 日の摂取カロリー平均 (kcal/日)
                          front 側の週平均カロリー表示に使う場合はこの値を利用すること。
    """
    work = df.copy()
    work["log_date"] = work["log_date"].dt.strftime("%Y-%m-%d")

    # 後方 SMA_WINDOW 日の TDEE 平均 (min_periods=3 で枠が足りない場合は None)
    work["avg_tdee_7d"] = work["tdee_estimated"].rolling(
        window=SMA_WINDOW, min_periods=3
    ).mean()

    # 後方 SMA_WINDOW 日のカロリー平均 (calories 列がある場合のみ)
    if "calories" in work.columns:
        work["avg_calories_7d"] = work["calories"].rolling(
            window=SMA_WINDOW, min_periods=1
        ).mean()
    else:
        work["avg_calories_7d"] = np.nan

    payload = work[["log_date", "weight_sma7", "tdee_estimated", "avg_tdee_7d", "avg_calories_7d"]].copy()
    # inf → NaN → None の順で正規化
    payload = payload.replace([np.inf, -np.inf], np.nan)
    payload = payload.where(pd.notna(payload), None)

    # to_dict() が None を NaN に戻すため、dict 変換後にも非有限値を除去する
    def sanitize(record: dict) -> dict:
        return {
            k: (None if isinstance(v, float) and not math.isfinite(v) else v)
            for k, v in record.items()
        }

    return [sanitize(r) for r in payload.to_dict(orient="records")]


# ── 外部 I/O 層 ───────────────────────────────────────────────────────────────


def fetch_daily_logs(client) -> pd.DataFrame:
    """Supabase から daily_logs を全件取得して DataFrame で返す。"""
    response = client.table("daily_logs").select("*").order("log_date").execute()
    return pd.DataFrame(response.data)


def save_analytics_cache(client, records: list[dict]) -> None:
    """analytics_cache テーブルに enriched_logs を upsert する。"""
    client.table("analytics_cache").upsert(
        {
            "metric_type": "enriched_logs",
            "payload": records,
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

    if df.empty:
        logger.warning("No data found in daily_logs. Skipping.")
        return

    logger.info("Enriching data (%d rows)...", len(df))
    enriched = enrich_data(df)

    records = build_enriched_payload(enriched)

    logger.info("Saving enriched_logs (%d records) to 'analytics_cache'...", len(records))
    try:
        save_analytics_cache(client, records)
    except Exception as e:
        logger.error("Failed to save analytics_cache: %s", e)
        raise SystemExit(1)

    logger.info("Done. Saved %d enriched records to 'analytics_cache'.", len(records))


if __name__ == "__main__":
    main()
