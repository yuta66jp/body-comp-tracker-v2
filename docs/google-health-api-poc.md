# Google Health API 取得 PoC

Issue #681 の PoC。Google Health API から Fitbit / Google Health の主要ヘルスメトリクスを取得できることを確認するための最小実装。

## 目的

- DB 保存や分析反映の前に、Google Health API から対象データが取得できることを確認する。
- アクセストークン、必要スコープ、dataType、レスポンス構造を確認する。
- 本番向け OAuth フロー、refresh token 保存、定期同期はこの PoC の対象外。

## 取得対象

| 項目 | dataType | scope |
|---|---|---|
| 安静時心拍数 | `daily-resting-heart-rate` | `googlehealth.health_metrics_and_measurements.readonly` |
| HRV | `daily-heart-rate-variability` | `googlehealth.health_metrics_and_measurements.readonly` |
| SpO2 | `daily-oxygen-saturation` | `googlehealth.health_metrics_and_measurements.readonly` |
| 呼吸数 | `daily-respiratory-rate` | `googlehealth.health_metrics_and_measurements.readonly` |
| 睡眠セッション / 睡眠ステージ | `sleep` | `googlehealth.sleep.readonly` |

睡眠スコア専用の dataType は公式 data types 一覧では確認できないため、この PoC では取得対象に含めない。睡眠時間や睡眠ステージは `sleep.summary` / `sleep.stages` から確認する。

## 取得したい日次項目の仕様

以下は、今後 DB 保存・分析反映する場合に使う日次項目の取得仕様。Google Health API の data type 一覧では、`dataType` はエンドポイントで kebab case、`filter` では snake case を使う。

| 日次項目 | 推奨API | dataType | 必要scope | 日次値として使うフィールド | 備考 |
|---|---|---|---|---|---|
| ステップ数 | `dailyRollUp` / `list` | `steps` | `googlehealth.activity_and_fitness.readonly` | `rollupDataPoints[].steps.countSum` または `dataPoints[].steps.count` | 日次集計値が必要なため `dailyRollUp` を優先し、400 が返る場合は `list` で補完する。正規化値は `dataSource.platform = "FITBIT"` の歩数だけを採用する |
| 睡眠時間 | `list` | `sleep` | `googlehealth.sleep.readonly` | `dataPoints[].sleep.summary.minutesAsleep` | 睡眠セッション単位。日次保存時は `sleep.interval.civil_end_time` の日付を起床日として扱う |
| 深い睡眠時間 | `list` | `sleep` | `googlehealth.sleep.readonly` | `sleep.summary.stagesSummary[]` の `type = "DEEP"` の `minutes` | `stagesSummary` がない場合は `sleep.stages[]` の `type = "DEEP"` 区間から算出する |
| HRV | `list` | `daily-heart-rate-variability` | `googlehealth.health_metrics_and_measurements.readonly` | `dailyHeartRateVariability.averageHeartRateVariabilityMilliseconds` | Google Health API では日次HRVとして取得できる。必要に応じて `deepSleepRootMeanSquareOfSuccessiveDifferencesMilliseconds` も保持候補 |
| RHR | `list` | `daily-resting-heart-rate` | `googlehealth.health_metrics_and_measurements.readonly` | `dailyRestingHeartRate.beatsPerMinute` | `dailyRestingHeartRateMetadata.calculationMethod` も保存候補。睡眠込み算出か覚醒時データのみかを区別できる |

### ステップ数

日次歩数は `steps` の `dailyRollUp` を使う。

- Endpoint: `POST https://health.googleapis.com/v4/users/me/dataTypes/steps/dataPoints:dailyRollUp`
- Request body:
  - `range.start` / `range.end`: `CivilDateTime` の closed-open range。日付は `{ "date": { "year": ..., "month": ..., "day": ... } }` 形式で指定する。
  - `windowSizeDays`: `1`
  - `pageSize`: 取得日数。`windowSizeDays * pageSize` は `steps` の制約上 90 日以内にする。
  - `dataSourceFamily`: `users/me/dataSourceFamilies/google-wearables`。tracker devices 由来の歩数に絞り、スマホ由来との重複を避ける。
- Response:
  - `rollupDataPoints[].civilStartTime`
  - `rollupDataPoints[].civilEndTime`
  - `rollupDataPoints[].steps.countSum`

`countSum` は対象interval内の合計歩数。値がない場合は該当intervalに on-wrist / manual data point がない。`steps.count_sum = 0` 相当の値が返る場合は、着用されていたが歩数が記録されていない状態として扱う。

`dailyRollUp` が `400 Invalid argument in request.` を返す場合は、`steps` の `list` をフォールバックとして使う。

- Endpoint: `GET https://health.googleapis.com/v4/users/me/dataTypes/steps/dataPoints`
- Filter: `steps.interval.civil_start_time >= "<startDate>" AND steps.interval.civil_start_time < "<endExclusiveDate>"`
- Response:
  - `dataPoints[].steps.interval`
  - `dataPoints[].steps.count`

フォールバック時は `stepsResult.source` が `listFallback` になり、`stepsResult.fallbackFrom` に `dailyRollUp` のエラー情報が入る。`stepsResult.dataPoints` には raw response として Fitbit とスマホ由来のデータが混在する場合があるが、`dailyMetrics[].stepCount` は `dataSource.platform = "FITBIT"` の `steps.count` だけを日付ごとに合算した値を返す。

### 睡眠時間 / 深い睡眠時間

睡眠は `sleep` の `list` を使う。

- Endpoint: `GET https://health.googleapis.com/v4/users/me/dataTypes/sleep/dataPoints`
- Filter: `sleep.interval.civil_end_time >= "<startDate>" AND sleep.interval.civil_end_time < "<endExclusiveDate>"`
- Response:
  - `sleep.interval.startTime`
  - `sleep.interval.endTime`
  - `sleep.summary.minutesInSleepPeriod`
  - `sleep.summary.minutesAsleep`
  - `sleep.summary.minutesAwake`
  - `sleep.summary.stagesSummary[]`
  - `sleep.stages[]`
  - `sleep.metadata.stagesStatus`

日次の睡眠時間は `sleep.summary.minutesAsleep` を優先する。Google Health API の説明では、stages sleep の `minutesAsleep` は `LIGHT`、`REM`、`DEEP` の合計で、`AWAKE` は除外される。

深い睡眠時間は `sleep.summary.stagesSummary[]` から `type = "DEEP"` の `minutes` を取得する。`stagesSummary` が欠損している場合だけ、`sleep.stages[]` の `type = "DEEP"` の各区間差分を合計する。

### HRV

HRV は `daily-heart-rate-variability` の `list` を使う。

- Endpoint: `GET https://health.googleapis.com/v4/users/me/dataTypes/daily-heart-rate-variability/dataPoints`
- Filter: `daily_heart_rate_variability.date >= "<startDate>" AND daily_heart_rate_variability.date < "<endExclusiveDate>"`
- Response:
  - `dailyHeartRateVariability.date`
  - `dailyHeartRateVariability.averageHeartRateVariabilityMilliseconds`
  - `dailyHeartRateVariability.nonRemHeartRateBeatsPerMinute`
  - `dailyHeartRateVariability.entropy`
  - `dailyHeartRateVariability.deepSleepRootMeanSquareOfSuccessiveDifferencesMilliseconds`

分析でまず使う値は `averageHeartRateVariabilityMilliseconds`。必要に応じて、深い睡眠中RMSSDである `deepSleepRootMeanSquareOfSuccessiveDifferencesMilliseconds` も補助指標として保存する。

### RHR

RHR は `daily-resting-heart-rate` の `list` を使う。

- Endpoint: `GET https://health.googleapis.com/v4/users/me/dataTypes/daily-resting-heart-rate/dataPoints`
- Filter: `daily_resting_heart_rate.date >= "<startDate>" AND daily_resting_heart_rate.date < "<endExclusiveDate>"`
- Response:
  - `dailyRestingHeartRate.date`
  - `dailyRestingHeartRate.beatsPerMinute`
  - `dailyRestingHeartRate.dailyRestingHeartRateMetadata.calculationMethod`

分析でまず使う値は `beatsPerMinute`。`calculationMethod` は `WITH_SLEEP` / `ONLY_WITH_AWAKE_DATA` などの算出方法差を持つため、保存候補に含める。

## 使い方

1. Google Cloud で Google Health API を有効化し、OAuth 2.0 Web client を作成する。
2. OAuth 同意時に以下の scope を付与して access token を取得する。
3. ローカルで PoC を有効化して dev server を起動する。
4. `Authorization: Bearer <access_token>` 付きで PoC API を呼び出す。

必要 scope:

```text
https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly
https://www.googleapis.com/auth/googlehealth.sleep.readonly
```

ステップ数まで取得する場合は、以下も追加する。

```text
https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly
```

起動コマンド:

```bash
GOOGLE_HEALTH_POC_ENABLED=true npm run dev
```

確認コマンド:

```bash
curl 'http://localhost:3000/api/google-health/poc?start=2026-05-01&end=2026-05-31' -H "Authorization: Bearer $GOOGLE_HEALTH_ACCESS_TOKEN"
```

成功条件:

- HTTP 200 が返る。
- `results[].ok` が対象 dataType ごとに `true` になる。
- `results[].dataPoints` に Google Health API のレスポンスが入る。
- `dailyMetrics[]` に `stepCount`、`sleepMinutes`、`deepSleepMinutes`、`hrvMs`、`rhrBpm` の日次正規化結果が入る。
- `stepsResult.source` は、`dailyRollUp` 成功時は `dailyRollUp`、フォールバック成功時は `listFallback` になる。

一部 scope が不足している場合、その dataType だけ `ok: false` と Google Health API のエラーメッセージが返る。
ステップ数の scope が不足している場合は `stepsResult.ok: false` になるが、他の取得結果と `dailyMetrics` は取得できた項目だけで返る。

## API 仕様

`GET /api/google-health/poc`

Query:

| name | 必須 | 説明 |
|---|---:|---|
| `start` | 任意 | `YYYY-MM-DD`。未指定時は `end` から直近30日 |
| `end` | 任意 | `YYYY-MM-DD`。未指定時はJSTの今日 |

制限:

- 最大取得範囲は90日。
- `end` は利用者向けには含む日付として扱い、Google Health API には翌日未満の closed-open range として渡す。
- Google Health API の dataType はエンドポイントでは kebab case、filter では snake case で指定する。
- `GOOGLE_HEALTH_POC_ENABLED=true` がない場合は 403 を返す。
- access token は `Authorization: Bearer ...` を優先し、なければ `GOOGLE_HEALTH_ACCESS_TOKEN` 環境変数を使う。

## 参考

- https://developers.google.com/health
- https://developers.google.com/health/setup
- https://developers.google.com/health/data-types
- https://developers.google.com/health/reference/rest/v4/users.dataTypes.dataPoints/list
- https://developers.google.com/health/reference/rest/v4/users.dataTypes.dataPoints/dailyRollUp
- https://developers.google.com/health/reference/rest/v4/StepsRollupValue
