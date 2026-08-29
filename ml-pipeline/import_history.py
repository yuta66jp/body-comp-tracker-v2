"""
import_history.py — 旧版 history.csv を Supabase の seasons / career_logs に一括インポート

使用方法:
  SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... SUPABASE_OWNER_USER_ID=... python ml-pipeline/import_history.py <history.csv のパス>

例:
  SUPABASE_URL=https://xxx.supabase.co \
  SUPABASE_SERVICE_ROLE_KEY=... \
  SUPABASE_OWNER_USER_ID=... \
  python ml-pipeline/import_history.py /path/to/history.csv

※ 冪等 (upsert): 同じ (user_id, log_date, season) は上書き更新されます。
※ career_logs は旧データ上すべて大会 prep のため completed Cut season として登録します。
"""

import csv
import logging
import os
import sys
from uuid import UUID

from supabase import create_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

BATCH_SIZE = 100
OWNER_USER_ID_ENV = "SUPABASE_OWNER_USER_ID"


def parse_date(raw: str) -> str:
    """'2021/05/03' or '2021/05/03 7:00:00' → 'YYYY-MM-DD'"""
    return raw[:10].replace("/", "-")


def load_csv(path: str) -> list[dict]:
    records = []
    with open(path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                records.append(
                    {
                        "log_date": parse_date(row["Date"]),
                        "weight": float(row["Weight"]),
                        "season": row["Label"].strip(),
                        "target_date": parse_date(row["TargetDate"]),
                    }
                )
            except (KeyError, ValueError) as error:
                logger.warning("Skip row %s: %s", row, error)
    return records


def build_season_summaries(records: list[dict]) -> dict[str, dict]:
    """career rows から completed Cut season 作成用の決定的な summary を返す。"""
    grouped: dict[str, list[dict]] = {}
    for record in records:
        grouped.setdefault(record["season"], []).append(record)

    summaries: dict[str, dict] = {}
    for label, season_records in grouped.items():
        ordered = sorted(season_records, key=lambda record: record["log_date"])
        target_dates = {record["target_date"] for record in ordered}
        if len(target_dates) != 1:
            raise ValueError(f"Season {label} has multiple target dates")

        summaries[label] = {
            "count": len(ordered),
            "start_date": ordered[0]["log_date"],
            "start_weight": ordered[0]["weight"],
            "end_date": ordered[-1]["log_date"],
            "end_weight": ordered[-1]["weight"],
            "min_weight": min(record["weight"] for record in ordered),
            "target_date": next(iter(target_dates)),
        }
    return summaries


def require_owner_user_id() -> str:
    raw = os.environ.get(OWNER_USER_ID_ENV, "").strip()
    if not raw:
        raise ValueError(f"{OWNER_USER_ID_ENV} is required")
    try:
        return str(UUID(raw))
    except ValueError as error:
        raise ValueError(f"{OWNER_USER_ID_ENV} must be a UUID") from error


def ensure_seasons(client, owner_user_id: str, summaries: dict[str, dict]) -> dict[str, int]:
    """legacy season を作成し、label ごとの season id を返す。既存履歴は上書きしない。"""
    season_ids: dict[str, int] = {}
    for label, info in sorted(summaries.items()):
        existing = (
            client.table("seasons")
            .select("id")
            .eq("user_id", owner_user_id)
            .eq("name", label)
            .eq("start_date", info["start_date"])
            .limit(1)
            .execute()
            .data
        )
        if existing:
            season_ids[label] = int(existing[0]["id"])
            continue

        inserted = (
            client.table("seasons")
            .insert(
                {
                    "user_id": owner_user_id,
                    "name": label,
                    "phase": "Cut",
                    "start_date": info["start_date"],
                    "start_weight": info["start_weight"],
                    "target_date": info["target_date"],
                    "target_weight": None,
                    "status": "completed",
                    "end_date": info["end_date"],
                    "end_weight": info["end_weight"],
                }
            )
            .execute()
            .data
        )
        if not inserted:
            raise RuntimeError(f"Season insert returned no row: {label}")
        season_ids[label] = int(inserted[0]["id"])
    return season_ids


def main() -> None:
    if len(sys.argv) < 2:
        logger.info("%s", __doc__)
        sys.exit(1)

    csv_path = sys.argv[1]
    if not os.path.exists(csv_path):
        logger.error("File not found: %s", csv_path)
        sys.exit(1)

    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    try:
        owner_user_id = require_owner_user_id()
    except ValueError as error:
        logger.error("%s", error)
        sys.exit(1)
    client = create_client(url, key)

    logger.info("Loading %s ...", csv_path)
    records = load_csv(csv_path)
    logger.info("Loaded %d rows", len(records))

    # owner ごとの一意制約に合わせて同日・同 season の最後の記録を採用する。
    dedup: dict[tuple[str, str], dict] = {}
    for record in records:
        dedup[(record["log_date"], record["season"])] = record
    records = list(dedup.values())
    logger.info("After dedup: %d rows", len(records))

    try:
        seasons = build_season_summaries(records)
    except ValueError as error:
        logger.error("%s", error)
        sys.exit(1)

    for label, info in sorted(seasons.items()):
        logger.info(
            "  %s: %d件 / 仕上がり最小=%.1fkg / 大会日=%s",
            label,
            info["count"],
            info["min_weight"],
            info["target_date"],
        )

    season_ids = ensure_seasons(client, owner_user_id, seasons)
    for record in records:
        record["user_id"] = owner_user_id
        record["season_id"] = season_ids[record["season"]]

    total = 0
    for i in range(0, len(records), BATCH_SIZE):
        batch = records[i : i + BATCH_SIZE]
        client.table("career_logs").upsert(
            batch,
            on_conflict="user_id,log_date,season",
        ).execute()
        total += len(batch)
        logger.info("Upserted %d / %d", total, len(records))

    logger.info("Done. %d rows imported to seasons / career_logs.", total)


if __name__ == "__main__":
    main()
