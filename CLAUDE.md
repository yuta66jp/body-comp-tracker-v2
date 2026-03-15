# Body Composition Tracker v2

## プロジェクト概要

個人利用のボディメイク / 減量判断アプリ。
減量・大会準備の進捗判断と振り返りを目的とする。

**設計方針:**
- 記録量より判断支援を重視
- 数値を増やすより、意味づけ・解釈・調整判断を優先
- 入力負担を増やしすぎない

## Architecture

```
Frontend:  Next.js 15 (App Router) + TypeScript → Vercel (Free Tier)
Database:  Supabase (PostgreSQL + Auth + RLS)
ML Batch:  Python (NeuralProphet + XGBoost) → GitHub Actions (日次 cron)
```

### Core Principle
**「計算」と「表示」の完全分離**
- NeuralProphet/XGBoost の学習処理は GitHub Actions の日次バッチで実行
- フロントエンドは事前計算済みの結果を Supabase から取得して描画するだけ
- Python バックエンドサーバーは不要。CRUD は supabase-js で直接実行
- TDEE / analytics の値は batch canonical を参照する。フロントで再計算しない

## Directory Structure

```
body-comp-tracker-v2/
├── src/
│   ├── app/                        # Next.js App Router
│   │   ├── page.tsx                # Dashboard (メイン)
│   │   ├── layout.tsx              # Root Layout
│   │   ├── tdee/page.tsx           # TDEE 分析画面
│   │   ├── macro/page.tsx          # 栄養分析画面
│   │   ├── history/page.tsx        # 過去シーズン比較
│   │   ├── settings/
│   │   │   ├── page.tsx            # 設定画面
│   │   │   └── actions.ts          # Server Actions (settings 保存)
│   │   ├── actions/                # Server Actions (daily_logs 保存)
│   │   │   ├── saveDailyLog.ts
│   │   │   └── buildUpdatePayload.ts
│   │   └── api/export/route.ts     # CSV エクスポート
│   ├── components/                 # UIコンポーネント
│   │   ├── dashboard/              # KpiCards, GoalNavigator, WeeklyReviewCard
│   │   ├── charts/                 # ForecastChart, FactorAnalysis
│   │   ├── tdee/                   # TdeeKpiCard, TdeeDetailChart, TdeeDailyTable
│   │   ├── macro/                  # MacroKpiCards, MacroPfcSummary, MacroStackedChart
│   │   ├── settings/               # SettingsForm (+ integration test)
│   │   ├── analytics/              # AnalyticsStatusNote
│   │   ├── meal/                   # MealLogger, FoodPicker, Cart
│   │   └── ui/                     # 共通UI (Button, Card, etc.)
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts           # Browser client
│   │   │   ├── server.ts           # Server client (SSR用)
│   │   │   └── types.ts            # DB型定義 (supabase gen types で生成)
│   │   ├── queries/                # Supabase read 系ロジック (query layer)
│   │   │   ├── dailyLogs.ts
│   │   │   ├── settings.ts
│   │   │   └── analytics.ts
│   │   ├── domain/
│   │   │   └── settings.ts         # AppSettings 型 + DB rows → AppSettings mapper
│   │   ├── schemas/
│   │   │   └── settingsSchema.ts   # settings 保存用 zod schema (Server Action と共有)
│   │   ├── analytics/
│   │   │   └── status.ts           # AnalyticsAvailability 型 (fresh/stale/unavailable/error)
│   │   ├── hooks/                  # Client-side hooks (useDailyLogs 等)
│   │   └── utils/                  # 計算ヘルパー
│   │       ├── date.ts             # JST 日付ユーティリティ (parseLocalDateStr, calcDaysLeft 等)
│   │       ├── calcReadiness.ts    # ReadinessMetrics 計算 (ペース分析・ゴールステータス)
│   │       ├── calcWeeklyReview.ts # 週次レビュー + 停滞検知
│   │       ├── calcTdee.ts         # 理論 TDEE / 信頼度 / 解釈補助
│   │       ├── calcMacro.ts        # Macro KPI 集計
│   │       └── ...                 # その他計算ヘルパー
│   └── styles/
│       └── globals.css             # Tailwind base
├── ml-pipeline/                    # Python (GitHub Actions 専用)
│   ├── predict.py                  # NeuralProphet バッチ予測
│   ├── analyze.py                  # XGBoost 因子分析
│   ├── enrich.py                   # TDEE計算・データ加工 (canonical source)
│   ├── requirements.txt            # Python依存 (neuralprophet, xgboost, supabase)
│   └── requirements-ci.txt         # CI用軽量依存 (supabase 不要)
├── .github/workflows/
│   ├── ml-daily.yml                # 日次バッチ (cron: 毎日 AM 3:00 JST)
│   └── ci.yml                      # Lint + TypeCheck + Build
├── CLAUDE.md                       # このファイル
├── README.md                       # 人間向け入口文書
├── .env.local                      # Supabase URL/Key (gitignore対象)
└── supabase/
    └── migrations/                 # DDL管理
```

## Tech Stack & Libraries

### Frontend
- **Framework**: Next.js 15 (App Router, TypeScript)
- **Styling**: Tailwind CSS 4
- **Charts**: Recharts
- **DB Client**: @supabase/supabase-js v2
- **Icons**: Lucide React

### ML Pipeline (Python)
- neuralprophet (体重予測)
- xgboost (因子分析)
- pandas, numpy
- supabase-py (結果書き込み。main() 内で遅延 import)

## Supabase Tables

- `daily_logs` — log_date(PK), weight, calories, protein, fat, carbs, note,
  sleep_hours, had_bowel_movement, training_type, work_mode
  - leg_flag は派生値（deriveLegFlag のみ定義源）。直接書き込まない
  - is_poor_sleep は UI から除去済み
- `food_master` — name(PK), protein, fat, carbs, calories, category
- `menu_master` — name(PK), recipe(JSONB)
- `settings` — key(PK), value_num, value_str
- `predictions` — id, ds(DATE), yhat(FLOAT), model_version(TEXT), created_at
- `analytics_cache` — metric_type(PK), payload(JSONB), updated_at

## 実装原則

### 一般原則
- 既存機能を壊さず段階的に改善する
- 同じ意味の値を別ロジックで増やさない（重複定義禁止）
- 集計ロジックと表示ロジックの責務を分ける
- 指標を増やすより、何を読めるかを優先する

### データ取得 (query layer)
- Supabase read 系ロジックは `src/lib/queries/` に集約する
- `page.tsx` から直接 `supabase.from().select()` を書かない
- query 関数は pure な async 関数として書き、テスト可能にする

### 設定 (settings)
- 保存: `src/app/settings/actions.ts` の Server Action を通じて行う
  - バリデーションは `src/lib/schemas/settingsSchema.ts` (zod) で実施
  - schema は Server Action と Client の両方から参照される
- 読み取り: `fetchSettings()` → `AppSettings` に変換して利用する
  - `AppSettings` の型定義は `src/lib/domain/settings.ts` に集約
  - コンポーネントは `AppSettings` を受け取る（raw DB rows を直接扱わない）
- settings に変更を加える場合は schema / mapper / action / domain の整合を保つ

### 保存まわり (daily_logs)
- `daily_logs` の部分更新安全性を維持する（未操作フィールドを上書きしない）
- `undefined` / `null` / 明示値の意味を混同しない
  - `undefined` = 未操作（送信しない）
  - `null` = 明示的クリア
  - 値 = 上書き
- touched 管理や partial update の考え方を崩さない
- `leg_flag` は `deriveLegFlag` のみを定義源とし、保存 payload に直接含めない
- CSV import は通常保存系と安易に混同しない

### 日付 / 集計
- 日付は JST 基準で扱う
- `new Date("YYYY-MM-DD")` は UTC 解釈になるため使用禁止 → `parseLocalDateStr()` を使う
- 残り日数は `calcDaysLeft(today, target)` を共通利用（`lib/utils/date.ts` に一元化済み）
- 「今日」の基準は `toJstDateStr()` を使う
- 期間定義を画面ごとにバラバラにしない
- 7暦日 (`dateRangeStr`) と 7記録日 (`slice(-7)`) は意味が異なる。混同しない

### ダッシュボード設計
- **KpiCards**: 前提条件・全体ステータス（残り日数・週数・大会日付・目標到達予定）
- **GoalNavigator**: 「間に合うか」の判断（体重進捗・ペース分析・調整提案）
  - ペース分析の primary 単位は **kg/2週**。週次と2週次を混在させない
  - 残り日数 / 残り週数 / 大会日付は KpiCards に集約し GoalNavigator に再掲しない
- **WeeklyReview**: 直近7暦日の実績振り返り（体重・栄養・エネルギーバランス・停滞検知）
- 3 パネルで同じ意味の数値が重複しないように設計する

### UI / 分析表示
- Macro / TDEE は「記録確認」ではなく「調整判断」画面として扱う
- 実績値だけでなく、差分・前週比・信頼度・解釈導線を重視する
- KPI には期間定義（7暦日 / 7記録日）・推定値区別（推定値 / 理論値）・fallback 説明を明示する
  - 注記の文言は実装の集計ロジックと一致させる
- AI 因子分析は因果ではなく振り返り補助として扱う
  - サンプル不足・欠損時は警告や代替表示を優先する
  - stability は importance の補助指標であり、同義ではない
- fallback 可能な画面はページ全体をブロックせず、未計算項目だけ unavailable にする
- NaN や意味不明な空欄をそのまま露出しない

### ml-pipeline
- `enrich.py`: TDEE 推定は `weight_sma7.diff()` + rolling median の平滑化ロジックを前提とする
- `enrich.py` の出力 (tdee_estimated / avg_tdee_7d 等) が canonical source。フロントで再計算しない
- `analyze.py` / `enrich.py` / `predict.py`: supabase は `main()` 内で遅延 import — トップレベルに戻さない
- キャッシュ: stale / unavailable の状態定義（`analytics_cache` の `status` 区分）を崩さない
  - `AnalyticsAvailability` 型 (`src/lib/analytics/status.ts`) が状態の単一定義源
- nullable / 三状態の意味論（未操作 / 明示値 / 明示クリア）を後退させない

## 非目標
- 予測モデルの大規模刷新を前提にしない
- 新規入力項目を無制限に増やさない
- 画面を数値だらけにしない
- 説明なしに指標を追加しない
- 見た目改善のためにロジック整合性を壊さない
- README と矛盾する説明を残さない

## 今後の課題

**直近の基盤整備は完了。今後はデータ蓄積後の分析拡張を慎重に進める。**

### データ蓄積後の課題
- 因子分析の特徴量拡張（sleep_hours / had_bowel_movement / training_type / work_mode / leg_flag）
  - 現時点ではサンプル不足・欠損率・カテゴリ偏りにより解釈が不安定
  - データが十分に蓄積された段階で着手する

### 別途管理している課題
- `had_bowel_movement` 三状態化（DB migration が必要: `BOOLEAN NOT NULL` → `BOOLEAN DEFAULT NULL`）
- `supabase gen types` で `types.ts` を実スキーマから再生成

## Coding Standards

### TypeScript
- `strict: true` を必ず有効にする
- 型は `lib/supabase/types.ts` に集約 (`supabase gen types typescript` で生成)
- コンポーネントは関数コンポーネント + Hooks のみ (クラスコンポーネント禁止)
- `any` 型の使用禁止。やむを得ない場合は `unknown` + type guard
- ファイル名: コンポーネントは PascalCase (`KpiCards.tsx`), ユーティリティは camelCase (`calcTdee.ts`)

### React / Next.js
- Server Components をデフォルトにする。`"use client"` は状態管理・イベントハンドラが必要な場合のみ
- データ取得は `src/lib/queries/` の query 関数を経由する（`page.tsx` に直接 Supabase クエリを書かない）
- settings の保存は `src/app/settings/actions.ts` の Server Action を使う（client 直書き禁止）
- `app/` 配下の `page.tsx` は薄く保つ (ロジックは components/ や lib/ に分離)
- 環境変数: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### テスト
- Jest は 2 プロジェクト構成: `node` 環境（unit tests）と `jsdom` 環境（UI integration tests）
- unit tests: `src/lib/utils/`, `src/lib/queries/`, `src/lib/domain/`, `src/lib/analytics/` 配下
- UI integration tests: `src/components/settings/SettingsForm.integration.test.tsx` など
  - 保存導線 / fallback 導線を壊さないことが重要
  - flaky を避けるため、安定したモック方針（Server Action mock）を維持する
- テスト実行: `node_modules/.bin/jest --no-coverage`

### Python (ml-pipeline/)
- 型ヒント必須 (`def predict(df: pd.DataFrame) -> pd.DataFrame:`)
- ロギングは `logging` モジュール (`print` デバッグ禁止)
- Supabase への書き込みは upsert を使用 (冪等性の保証)
- トップレベル import は軽量依存のみ。重い外部依存（supabase, xgboost, neuralprophet）は `main()` 内で遅延 import

### Git
- コミットメッセージ: Conventional Commits (`feat:`, `fix:`, `refactor:`, `chore:`, `docs:`, `test:`)
- ブランチ: `main` → 本番, `feature/xxx` → 機能別

## Commands
- `npm run dev` — 開発サーバー起動
- `npm run build` — 本番ビルド
- `npm run lint` — ESLint 実行
- `npx tsc --noEmit` — 型チェック
- `node_modules/.bin/jest --no-coverage` — テスト実行（unit + UI integration）
- `npx supabase gen types typescript --project-id <id> > src/lib/supabase/types.ts` — 型生成
