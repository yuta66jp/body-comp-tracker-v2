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

一部 scope が不足している場合、その dataType だけ `ok: false` と Google Health API のエラーメッセージが返る。

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
