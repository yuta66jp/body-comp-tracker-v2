# Single-user Auth / RLS 運用メモ

このアプリは個人利用を前提とするが、Vercel などにデプロイするとインターネットから到達可能になる。
そのため Supabase Auth と `user_id = auth.uid()` の RLS で、anon key だけでは主要な個人データを読めない状態にする。

## 対象

以下のユーザー入力データは `user_id` owner scoped にする。

- `daily_logs`
- `sleep_sessions`
- `settings`
- `food_master`
- `menu_master`

`predictions`, `analytics_cache`, `career_logs`, `forecast_backtest_*` はバッチ生成・読み取り用データとして既存方針を維持する。

## Supabase Auth 設定

1. Supabase Dashboard で自分用ユーザーを作成する。
2. 公開 signup は無効化するか、invite / 手動作成のみにする。
3. アプリの環境変数に許可メールを設定する。

```bash
NEXT_PUBLIC_ALLOWED_AUTH_EMAIL=you@example.com
```

この値はクライアント側のログイン UI と server layout の両方で使う。秘密情報ではない。

## 既存データ backfill

`20260425000000_single_user_auth_rls.sql` 適用後、既存行の `user_id` は `NULL` のまま残る。
Supabase Dashboard の `auth.users` で owner user id を確認し、SQL Editor で一度だけ以下を実行する。

```sql
-- owner user id に置き換える
DO $$
DECLARE
  owner_id UUID := '00000000-0000-0000-0000-000000000000';
BEGIN
  UPDATE daily_logs     SET user_id = owner_id WHERE user_id IS NULL;
  UPDATE sleep_sessions SET user_id = owner_id WHERE user_id IS NULL;
  UPDATE settings       SET user_id = owner_id WHERE user_id IS NULL;
  UPDATE food_master    SET user_id = owner_id WHERE user_id IS NULL;
  UPDATE menu_master    SET user_id = owner_id WHERE user_id IS NULL;
END $$;
```

backfill 前は、RLS により既存行がアプリから見えない。これは意図した移行状態。

## 動作確認

- 未ログイン状態でアプリを開くとログイン画面だけが表示される。
- ログイン後、通常画面が表示される。
- `daily_logs` などの主要テーブルは、Supabase anon key だけでは読み書きできない。
- 自分の session で作成した行には `user_id` が入る。
- CSV export / step import はログイン済み session の行だけを対象にする。

## 注意

- `SUPABASE_SERVICE_ROLE_KEY` は server 専用。`NEXT_PUBLIC_` にしない。
- ML / analytics バッチで service role を使う場合、RLS は bypass される。バッチの入力元を owner user のデータに絞る必要が出た場合は、別 issue で batch 側の owner 指定を追加する。
- この実装は single-user hardening であり、チーム共有や複数ユーザーの権限 UI は対象外。
