# Google Health 本番設定 / セキュリティ運用チェックリスト

Issue #697 の運用メモ。Google Health OAuth を本番環境で使う前に、Google Cloud、Vercel、Supabase、費用・quota、OAuth verification の確認項目をそろえる。

## 前提

- Google Health API は `health.googleapis.com` を使う。
- Cloud Healthcare API は `healthcare.googleapis.com` を使う別サービス。今回の Google Health 連携では使わない。
- 本番環境では、Google Health の access token / refresh token をブラウザに出さず、server-only の Route Handler で取得・更新・保存する。
- Google Health token は `private.google_health_connections` に暗号化済み payload として保存する。平文 token は DB / ログ / ブラウザに出さない。
- 保存済みの日次値は `google_health_daily_metrics` を使う。歩数・睡眠・HRV・安静時心拍数は Google Health を source of truth とする。
- 体重は Google Health の `weight` dataType から取得し、既存の `daily_logs.weight` に同期する。

## Google Cloud 設定

### API

- Google Cloud project で Google Health API を有効化する。
- Cloud Console の Enabled APIs で `Google Health API` / `health.googleapis.com` が有効であることを確認する。
- Cloud Healthcare API は有効化しない。もし有効化済みの場合でも、今回のアプリから `healthcare.googleapis.com` を呼ばないことを確認する。

### OAuth client

OAuth 2.0 client は Web application として作成する。

| 環境 | Redirect URI |
|---|---|
| local | `http://localhost:3000/api/google-health/oauth/callback` |
| production | `https://<production-domain>/api/google-health/oauth/callback` |

- Google Cloud Console の Authorized redirect URIs と `GOOGLE_OAUTH_REDIRECT_URI` は完全一致させる。
- preview 環境で OAuth を使う場合は、preview domain の redirect URI も追加する。
- Google Cloud の client ID / client secret は server-only env として扱う。

### OAuth consent screen

- App name、support email、developer contact email を設定する。
- Authorized domains に本番ドメインを追加する。
- Privacy Policy URL を設定する。
- 必要 scope の利用理由を、重複せず具体的に記載する。
- Testing のまま運用する場合は Test users に利用者メールを追加する。
- Testing mode で発行された refresh token は期限付きになるため、継続利用する本番環境では In production への公開要否を確認する。
- 公開運用や 100 ユーザー超の利用を想定する場合は OAuth verification を確認する。

### Scope

現在の実装で要求する scope は以下。

```text
https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly
https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly
https://www.googleapis.com/auth/googlehealth.sleep.readonly
```

用途:

| scope | 用途 |
|---|---|
| `googlehealth.activity_and_fitness.readonly` | 歩数 |
| `googlehealth.health_metrics_and_measurements.readonly` | 体重、HRV、安静時心拍数 |
| `googlehealth.sleep.readonly` | 睡眠時間、深睡眠、就寝・起床時刻 |

読み取り専用 scope のみ使う。write scope、ECG、nutrition、location などは今回のスコープ外。

## Vercel / server env

本番環境では以下を Vercel の Production Environment Variables に設定する。Preview で検証する場合は Preview にも設定する。

| 変数 | 種別 | 用途 |
|---|---|---|
| `GOOGLE_OAUTH_CLIENT_ID` | secret | Google OAuth client ID |
| `GOOGLE_OAUTH_CLIENT_SECRET` | secret | Google OAuth client secret |
| `GOOGLE_OAUTH_REDIRECT_URI` | config | OAuth callback URL |
| `GOOGLE_HEALTH_OAUTH_STATE_SECRET` | secret | OAuth state cookie の暗号化 |
| `GOOGLE_HEALTH_TOKEN_ENCRYPTION_KEY` | secret | Google OAuth token の暗号化 |
| `SUPABASE_SERVICE_ROLE_KEY` | secret | server-only token 保存・更新処理 |

設定してはいけないこと:

- `GOOGLE_OAUTH_CLIENT_SECRET`、`GOOGLE_HEALTH_OAUTH_STATE_SECRET`、`GOOGLE_HEALTH_TOKEN_ENCRYPTION_KEY`、`SUPABASE_SERVICE_ROLE_KEY` に `NEXT_PUBLIC_` を付けない。
- `SUPABASE_SERVICE_ROLE_KEY` をブラウザで使わない。
- access token / refresh token を env、ログ、GitHub、ブラウザに保存しない。
- 本番で PoC 用の `GOOGLE_HEALTH_ACCESS_TOKEN` を常用しない。

## secret 生成と管理

`GOOGLE_HEALTH_OAUTH_STATE_SECRET` と `GOOGLE_HEALTH_TOKEN_ENCRYPTION_KEY` は 32 bytes の値を使う。どちらも以下の形式で生成できる。

```bash
openssl rand -hex 32
```

目的: 32 bytes のランダム値を 64 桁 hex で生成する。
成功確認: 64 文字の hex 文字列が 1 行出力される。

運用:

- local と production は原則として別の値にする。
- production の `GOOGLE_HEALTH_TOKEN_ENCRYPTION_KEY` は保存済み token の復号に必要なため、安易に変更しない。
- `GOOGLE_HEALTH_TOKEN_ENCRYPTION_KEY` を変更すると、既存の encrypted token は復号できなくなる。key rotation は現時点では未実装。
- `GOOGLE_HEALTH_OAUTH_STATE_SECRET` の変更は、進行中の OAuth state cookie を無効化する。通常は環境ごとに固定する。

## Supabase

- `private.google_health_connections` が remote DB に適用済みであることを確認する。
- `google_health_daily_metrics` が remote DB に適用済みであることを確認する。
- `SUPABASE_SERVICE_ROLE_KEY` は Vercel server env のみに置く。
- token 保存テーブルは private schema で扱い、ブラウザや anon key から直接読ませない。
- Google Health 連携解除では OAuth token を revoke し、接続状態を切る。保存済みの日次メトリクスは削除しない。

## 費用 / quota / usage

### Google Health API

- Google Health API の rate limit は公式ドキュメントで daily / minutely / per-user の制限が示されている。
- Cloud Console で `Google Health API` の quota / usage を確認する。
- 429 が発生した場合は、同期処理側で過剰な再試行を避け、必要なら backoff を入れる。
- Google Health API の pricing / billing 表示が Cloud Console の Billing / Pricing / Reports 側に出るか確認する。
- 専用の公開 pricing ページだけで判断せず、実際に有効化した Google Cloud project の Cloud Console 表示を確認する。

### Billing / budget alert

Google Cloud Billing を有効化している場合は Budget alert を設定する。

- Billing > Budgets & alerts で対象 project を含む budget を作成する。
- 低めの金額で 50%、80%、100% などの通知閾値を設定する。
- 通知先メールを確認する。
- Budget alert は通知であり、費用発生を強制停止する仕組みではない。異常検知後の対応手順も合わせて決める。

### Cloud Healthcare API を混同しない

- Cloud Healthcare API は Google Health API とは別サービス。
- Cloud Healthcare API には公式 pricing があり、storage、request volume、notification などで課金される。
- 今回のアプリは `health.googleapis.com/v4` の Google Health API だけを呼ぶ。`healthcare.googleapis.com` を呼ぶ実装は追加しない。
- Cloud Healthcare API を有効化・利用する場合は、別 Issue で目的、費用、データ管理を整理してから扱う。

## OAuth verification / privacy

公開運用前に以下を確認する。

- Google Health API Developer and User Data Policy を確認する。
- Google API Services User Data Policy を確認する。
- アプリ内で、Google Health のデータを何のために取得・保存・表示するかを利用者に説明できているか確認する。
- Privacy Policy に、取得する Google Health データ、利用目的、保存先、削除・連携解除の扱いを記載する。
- Google Health の restricted scope を使うため、公開運用・100 ユーザー超・Google からの要請がある場合は OAuth verification / security assessment の要否を確認する。

## 本番適用前チェックリスト

- [ ] Google Health API が有効化されている。
- [ ] Cloud Healthcare API を誤って有効化・利用していない。
- [ ] OAuth client の redirect URI が production domain と完全一致している。
- [ ] OAuth consent screen に app information、authorized domain、privacy policy URL が設定されている。
- [ ] 必要 scope 3 つだけを Google Cloud Console に登録している。
- [ ] Testing mode の場合、利用者メールが Test users に入っている。
- [ ] Testing mode の refresh token 期限を許容できるか、In production へ移行するかを確認している。
- [ ] 公開運用前に OAuth verification / privacy policy / in-app disclosure を確認している。
- [ ] Vercel Production env に server-only env が設定されている。
- [ ] `SUPABASE_SERVICE_ROLE_KEY`、Google OAuth secret、token encryption key が `NEXT_PUBLIC_` になっていない。
- [ ] `private.google_health_connections` と `google_health_daily_metrics` の migration が remote DB に適用済み。
- [ ] Google Cloud Billing が有効な場合、Budget alert を設定している。
- [ ] Google Health API の quota / usage を Cloud Console で確認している。
- [ ] Google Health API の pricing / billing 表示が Cloud Console 側に出るか確認している。
- [ ] 本番で `/api/google-health/oauth/start` から連携できる。
- [ ] 本番の設定画面で Google Health 連携状態が `connected` になる。
- [ ] 本番の同期ボタンで `google_health_daily_metrics` に日次データが保存される。
- [ ] Cloud Logging / Vercel logs に token や個人データの詳細が出ていない。

## 参考

- Google Health API setup: https://developers.google.com/health/setup
- Google Health API data types: https://developers.google.com/health/data-types
- Google Health API scopes: https://developers.google.com/health/scopes
- Google Health API rate limits: https://developers.google.com/health/rate-limits
- Google Health API developer checklist: https://developers.google.com/health/developer-checklist
- Google Health API app verification: https://developers.google.com/health/app-verification
- Google API Services User Data Policy: https://developers.google.com/terms/api-services-user-data-policy
- Cloud Quotas: https://docs.cloud.google.com/docs/quotas/view-manage
- Cloud Billing budgets: https://docs.cloud.google.com/billing/docs/how-to/budgets
- Cloud Billing pricing table: https://docs.cloud.google.com/billing/docs/how-to/pricing-table
- Cloud Healthcare API pricing: https://cloud.google.com/healthcare-api/pricing
