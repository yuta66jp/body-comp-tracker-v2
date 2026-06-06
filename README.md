# body-comp-tracker-v2

個人利用のボディメイク / 体重管理アプリ。
減量・大会準備の進捗判断と振り返りを目的として使用する。
単なる記録ではなく、「何を調整すべきか」が読み取れることを重視している。

## 主要機能

### 日次ログ記録

- 体重
- Macro（カロリー・タンパク質・脂質・炭水化物）
- コンディション：就寝・起床時刻（→睡眠時間）・便通・トレーニング種別・勤務モード
- メモ
- ※ leg_flag は training_type から自動導出（直接入力なし）

**便通の記録について**
`had_bowel_movement` は三状態（`null` = 未記録 / `false` = 便通なし / `true` = 便通あり）で管理している。
DB は `BOOLEAN DEFAULT NULL` に移行済み。
「未記録」と「便通なし」を区別した集計・分析が可能。

### ダッシュボード

上部 3 パネル（KpiCards / GoalNavigator / WeeklyReview）と、下部タブ切替セクションで構成される。

**上部 3 パネル**

- **KPI カード**: 現在体重・残り日数（週数）・目標到達予定日
- **GoalNavigator**: 「このままで間に合うか」の判断パネル
  - 体重進捗（現在 / 目標 / 残り kg）
  - ペース分析（必要ペース vs 実績ペース、単位: kg/2週）
  - 調整提案（推奨カロリー調整 + 理由の一行説明）
  - 月次計画進捗: `buildMonthlyGoalPlan` が算出した当月末目標に対し、現在の 7 日平均体重がどの位置にあるかをゲージ＋差分で表示
- **直近7日サマリー（WeeklyReview）**: 「今日を含む直近7暦日」のローリング集計。固定週ではなく常に今日起点で動く
  - 体重（14暦日トレンド含む）・カロリー・タンパク質比・エネルギーバランス差・停滞検知を表示
  - 栄養 PFC の詳細は Macro ページ、TDEE 詳細は TDEE ページに委譲。ダッシュボードでは要約に寄せている
- 3 パネルの役割は分離しており、同じ意味の数値が重複して表示されない

**体重トレンド `kg/週` の意味統一**
KPI カードの `kg/週` 表示と直近7日サマリーの「14日トレンド」は、14暦日ベースの線形回帰（傾き × 7）に統一されている。
前週比（直近7暦日平均 vs 前7暦日平均の差）は別指標として残る。

**下部タブ: 直近ログ / カレンダー / 月別サマリー**

- **直近ログ**: 日次ログの一覧表示
- **カレンダー**: 月間カレンダー形式で当月のログを俯瞰（後述）
- **月別サマリー**: 月単位の集計サマリー＋月次計画 vs 実績比較表（`MonthlyGoalTable`）
  - `buildMonthlyGoalPlan` の plan entries と daily_logs を結合し、月ごとに以下の列を表示
    - 月初体重 / 月末目標 / 実績月末 / 差分 / 状態 / 翌月必要変化量
  - **状態** (`progressState`): Cut/Bulk フェーズを考慮した月ごとの進捗判定（先行 / 計画内 / 遅れ / 未確定）
    - Cut: diffKg < −0.2 kg → 先行、> +0.2 kg → 遅れ
    - Bulk: diffKg > +0.2 kg → 先行、< −0.2 kg → 遅れ
    - 当月 partial / 未来月 / データなしは「未確定（—）」
  - **翌月必要変化量** (`nextRequiredDeltaKg`): 次月の月末目標から実績月末体重を引いた値。実績なし・最終月は空欄
  - 当月は直近実測値を表示（`*` 注記付き）、未来月は空欄
  - モバイル表示: 月初体重・翌月必要変化量は sm 以上でのみ表示（`hidden sm:table-cell`）

### 月間カレンダー

react-day-picker v9 ベースの月間カレンダー。当月をデフォルト表示し、前月 / 翌月への切替が可能。

各日セルに表示される情報（縦方向優先順）:

1. 日付（左上）/ 祝日名（右端、補助テキスト）
2. 体重（太字）
3. 体重前日差分（色付き）
4. 摂取カロリー
5. カロリー差分（補助行）
6. 特殊日タグ（チートデイ・リフィード等）
7. コンディションタグ（便通・トレーニング種別・勤務モード、sm 以上）

土日祝の表示:

- 土曜: 日付テキスト `text-sky-600` / セル `bg-sky-50`
- 日曜・祝日: 日付テキスト `text-rose-600` / セル `bg-rose-50`
- 今日: `ring-2 ring-inset ring-blue-400` でリング表示
- 祝日判定: `japanese-holidays` パッケージ。祝日名を日付行右端に補助表示
- 開始曜日: 日曜始まり

差分計算は `buildCalendarDayMap`（`lib/utils/calendarUtils.ts`）に委譲。欠損日を跨いだ直前ログとの差分を表示する。

### 体重推移・予測チャート

ForecastChart（`src/components/charts/ForecastChart.tsx`）は 3 タブ（7日 / 31日 / 全体）で切替表示する。

- **月次目標ステップライン**: plan entries がある場合のみ表示。`buildMonthlyGoalPlan` の entries を `stepAfter` 折れ線で描画（月内フラット・月境界で段差）
- **縦軸ラベル**: 整数表示（`Math.floor`）に統一
  - 7日タブ: 1 kg 刻み
  - 31日タブ: 2 kg 刻み
  - 全体タブ: Recharts 自動（刻み幅指定なし）
- **目標体重ライン・大会日縦線**: 全体タブのみ表示
- **予測ライン（NeuralProphet）**: 全体タブのみ表示。7日 / 31日タブでは実績ログのみを描画

### Macro 画面

- 週平均カロリー・PFC の目標差分
- 前週比
- PFC kcal 比率
- 直近7記録日の平均（集計期間を画面上で明示）

### TDEE 画面

- 平均摂取カロリー
- 実測 TDEE（ML バッチが算出した推定値を表示。フロントで再計算しない）
  - 主表示: **14日平均**（`avg_tdee_14d`）— 傾向判断の基準線
  - 補助表示: **7日平均**（`avg_tdee_7d`）— 短期変化確認
- 収支差分（消費側は 14日平均 TDEE を基準に算出）
- 理論変化 / 実測変化
- 信頼度表示
- batch 側で算出・平滑化した canonical な TDEE 値を表示する前提
- **手動更新ボタン**: ml-daily バッチ実行後の即時反映用。保存済み `analytics_cache` の再表示であり、再計算ではない

### AI 因子分析

- XGBoost による翌日体重変化量への特徴量重要度（解釈補助テキストあり）
- **因果を断定するものではなく、振り返り補助として使用する**
- サンプル数・欠損状況によって解釈に注意が必要
- データ不足時は警告 / 表示抑制を行う

**現在の active 特徴量（feature_registry.py で管理）**

| 特徴量 | 説明 |
|---|---|
| cal_lag1 | 摂取 kcal（当日） |
| rolling_cal_7 | 摂取 kcal（週平均） |
| p_lag1 | タンパク質（g） |
| f_lag1 | 脂質（g） |
| c_lag1 | 炭水化物（g） |

`sleep_hours` / `had_bowel_movement` / `training_type` / `work_mode` / `leg_flag` 等の condition 系特徴量は
`feature_registry.py` に `active=False` で登録済み。データ蓄積後に段階投入する（後述）。

### stability 指標について

- **stability** は feature importance がデータの微小な変動でどの程度変わるかを示す補助指標
- **high**: ほぼ安定して同じ特徴量が重要と判定される
- **medium**: ある程度安定しているが、解釈には注意が必要
- **low**: データの揺らぎによって重要度が変わりやすく、強い解釈は避ける
- importance が高くても stability が低い場合、偶然の相関や小サンプルの影響を受けている可能性がある

### 予測精度ページ（`/forecast-accuracy`）

- walk-forward backtest（NeuralProphet）の結果を表示
- 単日体重ベース / 7日平均体重ベース（sma7）の 2 系列を比較表示
- **手動更新ボタン**: ISR キャッシュが残っていても、保存済み backtest 結果をすぐ反映できる
  - backtest の再実行ではなく、保存済み結果の再表示（キャッシュ再検証）である
  - 通常の 1 時間キャッシュ戦略は維持されており、backtest 実行直後の確認時のみ使う

### 設定（Settings）

- 目標体重・大会日付・TDEE 設定などを管理
- 保存は Server Action + shared schema（settingsSchema.ts）で一元処理
- 読み取りは typed domain model（AppSettings）に変換して利用
- UI integration test（jsdom）で保存導線・fallback 導線を自動検証
- **月次目標計画セクション（MonthlyGoalPlanSection）**: `buildMonthlyGoalPlan` を使い、大会日・目標体重から月末目標を自動配分してプレビュー表示
  - 各月を手動 override すると、その月の目標体重が固定され、残余 kg が後続月に線形再配分される
  - override 済み月には「解除」ボタンを表示。解除すると override 配列から削除され `buildMonthlyGoalPlan` が再計算する
  - override は upsert 方式で管理: 既存 override を上書きし、他月の override を消さない
  - `monthly_plan_overrides`（JSON 配列）として DB の settings テーブルに保存

### fallback 表示

- データ未取得・未計算の項目はページ全体を止めず、該当項目のみ unavailable 表示にする
- DB フェッチエラー（`kind: "error"`）と「まだデータがない」（`kind: "ok"` で空）は別扱い。
  エラー時はページ上部にエラーバナーを表示しつつコンテンツを graceful degradation させる。

### スマホ対応

主要画面についてスマホ表示を前提としたUI最適化を実施している。

- **モバイル下部タブバー**: 主要ページへの移動を片手で行いやすくする固定タブバーを追加
- **ダッシュボード**: 入力フォームを常時展開せず、KPI・ゴールガイド・週次レビューを先に確認できる導線に整理
- **History**: 重要なシーズン比較を先に表示し、詳細比較は後段で確認できる構成に再設計
- **TDEE / Macro**: 日次テーブルをモバイル向けカード表示でも読めるようにし、横スクロール依存を解消
- **Foods**: 検索バーを最上位に配置し、食品・セットメニューともにスマホ向けカード表示を導入
- **Settings**: セクション分割・アコーディオン化・固定保存バーにより、長い設定画面でも操作しやすく整理
- **Forecast Accuracy**: ベストモデルと主要差分をモバイルで把握しやすい要約カードを追加

共通レイアウト基盤（`PageShell` / `BottomSpacer` / `TableScroll`）を整備し、ページ間で余白・固定UI・横スクロール処理の一貫性を確保している。

---

## 実装済み基盤

### 保存・入力基盤

| 項目 | 内容 |
|---|---|
| 保存安全性 | daily_logs の部分更新安全化（未操作フィールドを上書きしない） |
| atomic 保存 | `saveDailyLog` が `save_daily_log_partial` RPC を呼ぶ atomic upsert に移行。fetch-then-upsert の競合を排除 |
| log_date 検証 | `parseLocalDateStr` による厳密バリデーション。不正フォーマットを保存前に拒否 |
| had_bowel_movement 三状態 | DB を `BOOLEAN DEFAULT NULL` に移行。null=未記録 / false=便通なし / true=便通あり の意味論を保存から分析まで貫通 |
| nullable UX | three-state（未操作 / 明示値 / 明示クリア）の整合性を確認・整備 |
| 日付基準統一 | 残り日数・週次比較の計算を JST 基準で統一（`calcDaysLeft` / `toJstDateStr`） |

### 分析・ML 基盤

| 項目 | 内容 |
|---|---|
| feature registry | `ml-pipeline/feature_registry.py` が特徴量定義の単一ソース。analyze.py は `active_feature_cols()` / `active_feature_labels()` を呼ぶ。FEATURE_COLS / FEATURE_LABELS の直書き廃止 |
| featureLabels.ts 同期 | `ACTIVE_FEATURE_NAMES as const` + `ACTIVE_FEATURE_EXPLANATIONS` で TypeScript がコンパイル時に説明マップの完全性を保証。`test_feature_registry.py` の `TestActiveFeatureNamesSync` が Python 側 `active_feature_names()` と TS 側 `ACTIVE_FEATURE_NAMES` の一致をテストで自動検知 |
| backtest 実験基盤 | `backtest.py` が CLI オプション（`--series-type` / `--max-origins` / `--origin-step-days` / `--horizons` / `--feature-set`）で実験条件を制御可能。デフォルト設定を変えずに条件比較できる |
| TDEE batch canonical | フロント再計算を廃止。`enrich.py` が算出した値を canonical として表示 |
| 読み取りエラー区別 | `QueryResult<T>` discriminated union（`kind: "ok"` / `kind: "error"`）で、DB エラーと正常な空状態を型レベルで分離。主要クエリ（daily_logs / career_logs / settings 系）に適用し、各ページで error banner を表示しつつ graceful degradation を維持する |

### settings / query layer

| 項目 | 内容 |
|---|---|
| settings 統一 | Server Action + shared schema（settingsSchema.ts）で保存。typed AppSettings で読み取り |
| query layer | Supabase read 系ロジックを `src/lib/queries/` に集約。主要クエリは `QueryResult<T>` で状態を明示し、補助的なクエリ（career_logs-for-dashboard / predictions 等）はベストエフォートで空配列フォールバック。意図を JSDoc に明記 |
| UI integration tests | 保存導線・fallback 導線を jsdom ベースで自動検証 |

### CI

| 項目 | 内容 |
|---|---|
| TypeScript | lint / tsc / jest / build を CI で自動検証 |
| Python | pytest で `test_analyze.py` / `test_enrich.py` / `test_feature_registry.py` / `test_backtest.py` を CI 監視 |
| E2E smoke | Playwright でログイン画面と認証済み主要画面を読み取り専用で検証 |

#### E2E smoke の CI secrets

`.github/workflows/e2e.yml` は PR / main push / 手動実行で `npm run e2e:smoke` を実行する。
以下の GitHub Actions secrets を設定すると、CI で認証済み主要画面の smoke test が必須実行される。
未設定の場合、CI は未認証ログイン画面だけを確認し、認証済み画面は skipped になる。

| Secret | 用途 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | E2E 対象 Supabase project |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | E2E 対象 Supabase anon key |
| `E2E_AUTH_EMAIL` | Supabase Auth の読み取り専用 smoke 用ユーザー。workflow 内で server-only `ALLOWED_AUTH_EMAIL` にも使う |
| `E2E_AUTH_PASSWORD` | 上記ユーザーのパスワード |

E2E smoke は書き込み操作を行わない。`E2E_AUTH_EMAIL` は、Supabase Auth に存在し、RLS 適用後の主要画面を読み取れるユーザーにする。
ローカルで `E2E_AUTH_EMAIL` / `E2E_AUTH_PASSWORD` が未設定の場合、未認証ログイン画面の確認だけ実行し、認証済み画面は skipped になる。
`E2E_REQUIRE_AUTH=true` を付けると、認証情報未設定時に失敗させられる。

```bash
E2E_AUTH_EMAIL=you@example.com E2E_AUTH_PASSWORD='password' npm run e2e:smoke
E2E_REQUIRE_AUTH=true E2E_AUTH_EMAIL=you@example.com E2E_AUTH_PASSWORD='password' npm run e2e:smoke
```

---

## 開発状況 / 今後の方針

本プロジェクトは主要な実装フェーズを一旦完了し、現在は運用期間に入っています。

運用期間の目的、想定期間、condition 系特徴量の段階投入、SHAP ベース説明への移行、read projection / window 最適化の扱いについては `docs/project-status.md` を参照してください。

### condition 系特徴量の段階投入

condition 系特徴量は、欠損率・分布・有効行数への影響を確認しながら少数ずつ投入する。

2026-04-27 時点では、2026-03-11 以降データの確認結果に基づき、
`sleep_hours` を最初の condition 系特徴量として `active=True` に変更済み。

その他の候補は `feature_registry.py` に将来候補として残している。

- `had_bowel_movement` / `leg_flag`: 次の候補
- `is_cheat_day` / `is_refeed_day` / `is_eating_out`: 対象期間では全件 `false` のため継続観測
- `training_type` / `work_mode`: 対象期間では全欠損のため投入保留

詳細は `docs/project-status.md` を参照。

### SHAP ベース説明への移行（将来課題）

現在の因子分析は XGBoost の `feature_importances_`（重要度の大きさのみ）を使用している。
SHAP（各予測への寄与量）は個別サンプルへの説明力が高く、将来の移行候補として
`feature_registry.py` の `encoder_hint` に想定設計を残している。

現時点では未実装。移行する場合は `analyze.py` の `run_importance()` を差し替える想定で、
`feature_registry.py` 自体は変更不要な設計になっている。

### read projection / window 最適化（現時点では保留）

画面別 projection query への分離は完了済み（`fetchDashboardDailyLogs` / `fetchMacroDailyLogs` / `fetchTdeeDailyLogs` 等）。
詳細は `docs/daily-logs-read-inventory.md` を参照。
ページネーション・cursor-based pagination は個人利用規模で不要のため保留中。

---

## アクセス制御の前提

このアプリは **個人利用** を前提としつつ、デプロイ時に外部から到達できる可能性に備えて Supabase Auth と RLS を導入している。
アプリ画面はログイン必須で、主要なユーザー入力データは `user_id = auth.uid()` で owner scoped にする。

### Supabase client と key の使い分け

| 用途 | key | 場所 |
|---|---|---|
| フロントエンド（ブラウザ） | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `src/lib/supabase/client.ts` |
| Server Components / Server Actions / Route Handlers | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `src/lib/supabase/server.ts` |
| ML バッチ（GitHub Actions） | `SUPABASE_SERVICE_ROLE_KEY` | ml-pipeline（GitHub Secrets 経由） |

Server 側では anon key に加えて httpOnly cookie から取得した Supabase Auth の access token を渡すため、**RLS ポリシーが主要なアクセス制御層** となる。
Client Components のデータ取得も `/api/client-data` 経由で server-side Supabase client に寄せ、browser Supabase client は session を永続化しない。

### RLS ポリシーの方針

`supabase/migrations/` で定義された RLS ポリシーは以下の方針に基づく:

| テーブル群 | anon | authenticated | service_role |
|---|---|---|---|
| `daily_logs` / `sleep_sessions` / `food_master` / `menu_master` / `settings` | なし | 自分の `user_id` 行のみ SELECT / INSERT / UPDATE / DELETE | RLS バイパス |
| `predictions` / `analytics_cache` | なし | SELECT のみ | RLS バイパス（ML バッチが書き込み） |
| `career_logs` / `forecast_backtest_*` | なし | SELECT のみ | ALL（ML バッチが書き込み） |

### 個人利用デプロイ時の成立条件

- Supabase Auth で自分用ユーザーを作成している
- 公開 signup を無効化するか、invite / 手動作成のみにしている
- 本番 / preview では server-only `ALLOWED_AUTH_EMAIL` に許可メールを設定している
- 既存データの `user_id` backfill を完了している
- `SUPABASE_SERVICE_ROLE_KEY` はサーバー専用（GitHub Secrets / `.env.local`）に限定し、クライアントバンドルに含めない

本番 / preview で `ALLOWED_AUTH_EMAIL` が未設定の場合、Auth gate は fail-closed になり、Supabase Auth ユーザーが存在してもログインを許可しない。
ローカル開発では未設定でも server-side allowlist 判定を通すが、デプロイ環境では必ず設定する。

### /api/export エンドポイントについて

`/api/export` はログイン済み session を要求し、`daily_logs` / `food_master` / `predictions` を CSV で返す。
ユーザー入力データは RLS により自分の `user_id` 行だけが返る。

- `daily_logs` には体重・睡眠・腸の記録など個人データが含まれる
- export / step import はログイン済み session の権限で実行する

### 将来 multi-user 対応を行う場合

1. `daily_logs.log_date` や `settings.key` などのグローバル UNIQUE / PRIMARY KEY を `user_id` 複合キーへ移行
2. ユーザー招待・削除・権限管理 UI を追加
3. ML / analytics バッチの owner user 指定を明示化

---

## Tech Stack

| Layer | Stack |
|---|---|
| Frontend | Next.js (App Router) + TypeScript + Tailwind CSS 4 |
| Database | Supabase (PostgreSQL + RLS) |
| Charts | Recharts |
| ML batch | Python — NeuralProphet, XGBoost (GitHub Actions, 日次 cron) |

## ローカル開発

### 1. 環境変数を設定する

`.env.local` を作成し、Supabase の接続情報を設定する。

```
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
```

### 2. DB スキーマを初期化する（新規環境の場合）

クリーンな Supabase project に対してスキーマを初期構築するには、Supabase CLI でマイグレーションを適用する。

```bash
# Supabase project にリンク（初回のみ）
npx supabase link --project-ref <project-ref>

# supabase/migrations/ を本番 DB に適用
npx supabase db push
```

`supabase/migrations/` だけで以下のテーブル・関数・RLS policy・トリガーが再現される:

| テーブル | migration ファイル |
|---|---|
| `daily_logs` | `20260101000000_create_daily_logs.sql` + 後続 ALTER 群 |
| `food_master` | `20260101000001_create_food_master.sql` |
| `menu_master` | `20260101000002_create_menu_master.sql` |
| `settings` | `20260101000003_create_settings.sql` |
| `predictions` | `20260308000000_create_predictions_and_analytics_cache.sql` |
| `analytics_cache` | `20260308000000_create_predictions_and_analytics_cache.sql` |
| `career_logs` | `20260308000001_create_career_logs.sql` |
| `forecast_backtest_*` | `20260311000000_create_backtest_tables.sql` |

RPC 関数 `save_daily_log_partial` は `20260315000003_fix_save_daily_log_partial_update_first.sql` で確定版が定義される。

#### 既存 DB にマイグレーションを追加した場合

`supabase/migrations/` にファイルを追加したら、必ず続けて以下を実行する:

```bash
npx supabase db push
```

> **備考**: 既に本番 DB に後続の migration が適用済みの状態で、より古いタイムスタンプの migration を追加した場合（例: 初期 create migration の遡及追加）は `--include-all` フラグが必要になる。
> ```bash
> npx supabase db push --include-all
> ```
> 遡及追加 migration は `CREATE TABLE IF NOT EXISTS` / `DO $$ EXCEPTION WHEN duplicate_object` などで冪等に書くこと。

### 3. 依存インストールと開発サーバー起動

```bash
npm install
npm run dev
```

### 4. コミット前の確認

```bash
npm run lint
npx tsc --noEmit
npm run build
```

### 4.1 個人利用デプロイ時のアクセス制御

Vercel などにデプロイする場合は、個人利用でも Supabase Auth + RLS を前提にする。
主要なユーザー入力テーブルは `user_id = auth.uid()` で owner scoped にし、派生データ系テーブルも authenticated read に限定する。
そのため anon key だけでは、ユーザー入力データもバッチ生成・分析データも読めない。

初回移行時は Supabase Auth の自分用ユーザーを作成し、server-only `ALLOWED_AUTH_EMAIL` を設定した上で、
既存行の `user_id` を owner user id で backfill する。手順は [docs/security-single-user-auth.md](docs/security-single-user-auth.md) を参照。

Google Health 連携を本番環境で使う場合は、Google Cloud OAuth、Vercel の server-only env、Supabase service role、quota / billing、OAuth verification を事前に確認する。
手順は [docs/google-health-production-readiness.md](docs/google-health-production-readiness.md) を参照。

### 5. テスト実行（unit tests + UI integration tests）

```bash
node_modules/.bin/jest --no-coverage
```

ML バッチ (`ml-pipeline/`) は `SUPABASE_URL` と `SUPABASE_SERVICE_ROLE_KEY` が必要。
GitHub Actions で実行することを前提としており、ローカル実行は原則行わない。
