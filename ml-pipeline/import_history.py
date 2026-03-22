"""
import_history.py — 旧版 history.csv を Supabase の career_logs テーブルに一括インポート

使用方法:
  SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... python ml-pipeline/import_history.py <history.csv のパス>

例:
  SUPABASE_URL=https://xxx.supabase.co \\
  SUPABASE_SERVICE_ROLE_KEY=... \\
  python ml-pipeline/import_history.py /path/to/history.csv

※ 冪等 (upsert): 同じ (log_date, season) は上書き更新されます。
"""

import csv
import logging
import os
import sys
from datetime import datetime, timezone

from supabase import create_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

BATCH_SIZE = 100


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
            except (KeyError, ValueError) as e:
                logger.warning("Skip row %s: %s", row, e)
    return records


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
    client = create_client(url, key)

    logger.info("Loading %s ...", csv_path)
    records = load_csv(csv_path)
    logger.info("Loaded %d rows", len(records))

    # (log_date, season) で重複排除（同日複数記録がある場合は最後を採用）
    dedup: dict[tuple[str, str], dict] = {}
    for r in records:
        dedup[(r["log_date"], r["season"])] = r
    records = list(dedup.values())
    logger.info("After dedup: %d rows", len(records))

    # シーズン別サマリー
    seasons: dict[str, dict] = {}
    for r in records:
        s = r["season"]
        if s not in seasons:
            seasons[s] = {"count": 0, "min": 999.0, "target_date": r["target_date"]}
        seasons[s]["count"] += 1
        seasons[s]["min"] = min(seasons[s]["min"], r["weight"])
    for label, info in sorted(seasons.items()):
        logger.info("  %s: %d件 / 仕上がり最小=%.1fkg / 大会日=%s",
                    label, info["count"], info["min"], info["target_date"])

    # バッチ upsert
    total = 0
    for i in range(0, len(records), BATCH_SIZE):
        batch = records[i : i + BATCH_SIZE]
        client.table("career_logs").upsert(batch, on_conflict="log_date,season").execute()
        total += len(batch)
        logger.info("Upserted %d / %d", total, len(records))

    logger.info("Done. %d rows imported to career_logs.", total)


if __name__ == "__main__":
    main()
