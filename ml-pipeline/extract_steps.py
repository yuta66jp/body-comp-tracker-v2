"""
extract_steps.py — Apple Health ZIP から日次歩数 CSV/JSON を生成するローカルツール

概要:
  Apple Health の「すべてのヘルスケアデータを書き出す」で生成された ZIP を入力とし、
  HKQuantityTypeIdentifierStepCount レコードのみを日次集計して CSV または JSON に出力する。

  巨大 XML (241MB 級) を DOM 全読込せずに ElementTree.iterparse で逐次処理する。

使用方法:
  python ml-pipeline/extract_steps.py <export.zip のパス> [オプション]

オプション:
  --format csv|json   出力形式 (デフォルト: csv)
  --output PATH       出力ファイルパス (デフォルト: daily_steps.csv / daily_steps.json)

実行例:
  python ml-pipeline/extract_steps.py ~/Downloads/export.zip
  python ml-pipeline/extract_steps.py ~/Downloads/export.zip --format json --output /tmp/steps.json

出力 CSV 形式:
  date,step_count
  2024-01-15,8432
  2024-01-16,12100
  ...

出力 JSON 形式:
  [{"date": "2024-01-15", "step_count": 8432}, ...]

注意:
  - 日付は startDate のタイムゾーン付き時刻から判定する (UTC 変換なしにローカル日付を使用)
  - Apple Watch / iPhone など複数デバイスの合算ではなく、sourceVersion / sourceName によらず全加算する
  - 同日の重複レコードはそのまま加算する (Apple Health の仕様に準拠)
  - export.xml が ZIP 内に存在しない場合はエラーを出力して終了する
"""

import argparse
import csv
import json
import logging
import sys
import zipfile
from collections import defaultdict
from datetime import datetime
from xml.etree.ElementTree import iterparse

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

STEP_TYPE = "HKQuantityTypeIdentifierStepCount"
EXPORT_XML_PATH = "apple_health_export/export.xml"


def parse_date_local(date_str: str) -> str:
    """
    Apple Health の日時文字列 ('2024-01-15 07:30:00 +0900') からローカル日付を返す。

    タイムゾーンオフセットを適用してそのデバイスが記録した現地日付を使用する。
    フォーマット: 'YYYY-MM-DD HH:MM:SS +HHMM' または 'YYYY-MM-DD HH:MM:SS -HHMM'
    """
    try:
        dt = datetime.strptime(date_str, "%Y-%m-%d %H:%M:%S %z")
        # astimezone でオフセット時間帯に変換してから日付を取得
        return dt.astimezone(dt.tzinfo).strftime("%Y-%m-%d")
    except ValueError:
        # フォーマットが想定外の場合は先頭 10 文字を返す (フォールバック)
        return date_str[:10]


def extract_daily_steps(zip_path: str) -> dict[str, int]:
    """
    Apple Health ZIP を開き、HKQuantityTypeIdentifierStepCount を日次集計した dict を返す。
    キー: 'YYYY-MM-DD', 値: その日の合計歩数 (int)
    """
    try:
        zf = zipfile.ZipFile(zip_path, "r")
    except FileNotFoundError:
        logger.error("ZIP ファイルが見つかりません: %s", zip_path)
        sys.exit(1)
    except zipfile.BadZipFile:
        logger.error("ZIP ファイルが壊れているか、ZIP 形式ではありません: %s", zip_path)
        sys.exit(1)

    # ZIP 内の構造確認
    names = zf.namelist()
    if EXPORT_XML_PATH not in names:
        logger.error(
            "export.xml が見つかりません。期待パス: %s\n"
            "ZIP 内のトップレベルエントリ (最大 10 件): %s",
            EXPORT_XML_PATH,
            names[:10],
        )
        zf.close()
        sys.exit(1)

    daily: dict[str, int] = defaultdict(int)
    record_count = 0
    step_count_total = 0

    logger.info("export.xml を逐次処理中 (大きなファイルは時間がかかります)...")

    with zf.open(EXPORT_XML_PATH) as xml_file:
        for _event, elem in iterparse(xml_file, events=("end",)):
            if elem.tag != "Record":
                elem.clear()
                continue

            if elem.get("type") != STEP_TYPE:
                elem.clear()
                continue

            start_date = elem.get("startDate", "")
            value_str = elem.get("value", "0")

            try:
                steps = int(float(value_str))
            except (ValueError, TypeError):
                elem.clear()
                continue

            date_key = parse_date_local(start_date)
            daily[date_key] += steps
            record_count += 1
            step_count_total += steps
            elem.clear()

    zf.close()
    logger.info(
        "処理完了: StepCount レコード %d 件 / 合計歩数 %d 歩 / %d 日分",
        record_count,
        step_count_total,
        len(daily),
    )
    return dict(daily)


def write_csv(daily: dict[str, int], output_path: str) -> None:
    sorted_days = sorted(daily.items())
    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["date", "step_count"])
        for date, steps in sorted_days:
            writer.writerow([date, steps])
    logger.info("CSV を出力しました: %s (%d 行)", output_path, len(sorted_days))


def write_json(daily: dict[str, int], output_path: str) -> None:
    rows = [{"date": date, "step_count": steps} for date, steps in sorted(daily.items())]
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, indent=2)
    logger.info("JSON を出力しました: %s (%d 件)", output_path, len(rows))


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Apple Health ZIP から日次歩数 CSV/JSON を生成する"
    )
    parser.add_argument("zip_path", help="Apple Health の書き出し ZIP ファイルパス")
    parser.add_argument(
        "--format",
        choices=["csv", "json"],
        default="csv",
        help="出力形式 (デフォルト: csv)",
    )
    parser.add_argument(
        "--output",
        default=None,
        help="出力ファイルパス (デフォルト: daily_steps.csv または daily_steps.json)",
    )
    args = parser.parse_args()

    output_path = args.output or f"daily_steps.{args.format}"

    daily = extract_daily_steps(args.zip_path)

    if not daily:
        logger.warning("歩数データが見つかりませんでした。ZIP に StepCount レコードが含まれているか確認してください。")
        sys.exit(0)

    if args.format == "csv":
        write_csv(daily, output_path)
    else:
        write_json(daily, output_path)


if __name__ == "__main__":
    main()
