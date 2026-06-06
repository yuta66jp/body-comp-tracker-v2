# Apple Health 歩数エクスポートツール

> **現在の扱い（#710 以降）**
> このツールは旧 `daily_logs.step_count` 向けのローカル変換ツールであり、現行アプリ導線では使わない。
> 現在の歩数は Google Health 同期で `google_health_daily_metrics.step_count` に保存する。
> このドキュメントは過去ツールの利用方法を履歴として残す。

`ml-pipeline/extract_steps.py` — Apple Health ZIP から日次歩数 CSV/JSON を生成するローカルツール。

## 目的

Apple Health の「すべてのヘルスケアデータを書き出す」で生成される ZIP は 200MB 超に達することがある。
このツールは巨大 ZIP/XML をアプリ本体に持ち込まず、ローカルで日次歩数だけを抽出して軽量な CSV/JSON に変換する。

生成した `daily_steps.csv` は Issue #444 の旧アプリ側インポート機能で利用していた。
現行では Google Health 同期を使うため、アプリへの取り込み手順としては扱わない。

---

## 前提環境

| 項目 | 要件 |
|---|---|
| Python | 3.10 以上 |
| 外部依存 | なし（標準ライブラリのみ） |
| OS | macOS / Linux / Windows (WSL) |

---

## 入力ファイル

| 項目 | 内容 |
|---|---|
| ファイル | Apple Health の書き出し ZIP |
| 取得方法 | iPhone「ヘルスケア」→ 右上アイコン → 「すべてのヘルスケアデータを書き出す」 |
| 想定パス | `~/Downloads/export.zip` など |
| ZIP 内構造 | `apple_health_export/export.xml` を含むこと |

---

## 実行コマンド

```bash
# CSV で出力 (デフォルト)
python ml-pipeline/extract_steps.py ~/Downloads/export.zip

# JSON で出力
python ml-pipeline/extract_steps.py ~/Downloads/export.zip --format json

# 出力先を指定
python ml-pipeline/extract_steps.py ~/Downloads/export.zip --output /tmp/daily_steps.csv

# JSON + 出力先指定
python ml-pipeline/extract_steps.py ~/Downloads/export.zip --format json --output /tmp/steps.json
```

---

## 出力ファイル

| 項目 | 内容 |
|---|---|
| デフォルトファイル名 | `daily_steps.csv` または `daily_steps.json` |
| 出力先 | コマンドを実行したカレントディレクトリ（`--output` で変更可） |

### CSV 形式 (`date,step_count`)

```csv
date,step_count
2024-01-15,8432
2024-01-16,12100
2024-01-17,6200
```

### JSON 形式

```json
[
  {"date": "2024-01-15", "step_count": 8432},
  {"date": "2024-01-16", "step_count": 12100},
  {"date": "2024-01-17", "step_count": 6200}
]
```

---

## 日付の扱い

- `startDate` 属性のタイムゾーン付き時刻（例: `2024-01-15 07:30:00 +0900`）を使用する
- タイムゾーンオフセットを適用した現地日付を `YYYY-MM-DD` 形式で記録する
- UTC 変換は行わない（デバイスが記録した現地日が `daily_logs.log_date` と整合しやすいため）
- **前提: デバイスのタイムゾーンが JST（+0900）であること**
  - UTC +0000 のデバイスでは、深夜 0〜9 時の記録が前日扱いになる場合がある
  - 海外渡航中など JST 以外のタイムゾーンで記録された期間は、日付がずれる可能性がある
- 出力は日付昇順でソートされる

---

## 制約

- 歩数（`HKQuantityTypeIdentifierStepCount`）のみを対象とする
- Apple Health の他指標（心拍数・睡眠など）は処理しない
- 複数デバイス（Apple Watch + iPhone）のレコードはそのまま合算する（Apple Health 標準仕様に準拠）
- 241MB 級 XML を逐次処理するため、ファイルサイズに応じて処理時間がかかる

---

## よくある失敗例

| 症状 | 原因 | 対処 |
|---|---|---|
| `ZIP ファイルが見つかりません` | パスが間違い / ファイル未ダウンロード | パスを確認し再実行 |
| `export.xml が見つかりません` | ZIP 構造が想定と異なる / 部分書き出し ZIP | Apple Health から再度完全書き出しを実施 |
| `ZIP ファイルが壊れているか、ZIP 形式ではありません` | ダウンロード失敗 / ファイルが壊れている | 再ダウンロードして実行 |
| `歩数データが見つかりませんでした` | 書き出し期間に歩数記録がない | Apple Health 側でデータがあるか確認 |
| 処理が長時間かかる | 数年分のデータを含む大容量 XML | 正常動作。進捗ログを確認しながら待機 |

---

## 旧導線

生成した `daily_steps.csv` は、旧設定画面の「歩数インポート（CSV / JSON）」セクションからアプリに取り込んでいた（`/api/step-import`）。
#710 以降、この導線は現行の保存方針では使わない。

```
extract_steps.py
    ↓ daily_steps.csv / daily_steps.json を生成
設定画面 → 歩数インポート（CSV / JSON）
    ↓ preflight（件数確認）→ 実行
旧 daily_logs.step_count に保存
```

現行の歩数保存・分析方針の詳細は `docs/step-count-and-fasting-hours.md` を参照。
