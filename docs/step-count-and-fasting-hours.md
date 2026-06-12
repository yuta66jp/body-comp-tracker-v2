# 旧歩数・断食・睡眠スキーマの整理

このドキュメントは、#435 / #443 / #444 / #501 で追加された旧スキーマと、#710 以降の現行方針を整理するためのメモである。

## 現在の結論

#710 で以下の旧スキーマは削除済み。

- `daily_logs.step_count`
- `daily_logs.sleep_hours`
- `daily_logs.last_meal_end_time`
- `sleep_sessions`

歩数・睡眠系データの source of truth は `google_health_daily_metrics` に統合した。
断食時間は `last_meal_end_time` の入力コストと精度の問題から廃止した。

## 現行の保存先

| 項目 | 保存先 | 備考 |
|---|---|---|
| 歩数 | `google_health_daily_metrics.step_count` | Google Health API の `steps` 由来 |
| 睡眠時間 | `google_health_daily_metrics.sleep_minutes` | 分単位。表示時に h / m へ変換 |
| 深睡眠 | `google_health_daily_metrics.deep_sleep_minutes` | Google Health の sleep summary / stages 由来 |
| 就寝時刻 | `google_health_daily_metrics.sleep_bed_at` | Google Health の sleep interval 開始 |
| 起床時刻 | `google_health_daily_metrics.sleep_wake_at` | Google Health の sleep interval 終了。`metric_date` は起床日基準 |
| HRV | `google_health_daily_metrics.hrv_ms` | 日次 HRV |
| 安静時心拍数 | `google_health_daily_metrics.rhr_bpm` | 日次 resting heart rate |

## 表示・集計の方針

- 直近ログ、カレンダー、月別サマリー、週間レビューは Google Health 由来の睡眠・歩数・HRV・安静時心拍数を使う。
- Google Health の値がない日は未記録として扱う。0 や推定値で補完しない。
- 睡眠は `metric_date` = 起床日として扱い、`daily_logs.log_date` と日付単位で対応させる。
- CSV export は `daily_logs` と `google_health_daily_metrics` を日付でマージして出力する。

## 旧仕様の扱い

### 歩数

旧仕様では Apple Health ZIP から `date,step_count` を抽出し、`daily_logs.step_count` に保存していた。
現行ではこの保存経路は使わない。

`ml-pipeline/extract_steps.py` と `docs/apple-health-step-export.md` は、過去のローカル変換ツールとして残っている。
アプリの現行導線では Google Health 同期を使う。

### 断食時間

旧仕様では `daily_logs.last_meal_end_time` と起床・測定時刻から断食時間を算出していた。
現行では `last_meal_end_time` を削除したため、断食時間の入力・表示・export は行わない。

### 睡眠

旧仕様では `sleep_sessions` を source of truth とし、`daily_logs.sleep_hours` へ projection していた。
現行では `sleep_sessions` と `daily_logs.sleep_hours` を削除し、Google Health の `sleep_minutes` / `sleep_bed_at` / `sleep_wake_at` を使う。

## 分析利用の注意

- 短期体重の要因分析は #720 で削除済みであり、Google Health 睡眠を ML 特徴量として取り込む予定はない。
- 旧 `step_count` / `sleep_hours` / `last_meal_end_time` を前提にした分析や import は、新規実装では使わない。

## 関連ドキュメント・ファイル

| 対象 | 場所 |
|---|---|
| Google Health 取得 PoC | `docs/google-health-api-poc.md` |
| Google Health 本番設定 | `docs/google-health-production-readiness.md` |
| Google Health 日次保存 | `src/lib/googleHealth/saveDailyMetrics.ts` |
| Google Health 日次取得 | `src/lib/googleHealth/dailyMetrics.ts` |
| Google Health 表示整形 | `src/lib/googleHealth/displayMetrics.ts` |
| CSV export | `src/app/api/export/route.ts` |
| 旧 Apple Health 歩数変換ツール | `ml-pipeline/extract_steps.py` |
