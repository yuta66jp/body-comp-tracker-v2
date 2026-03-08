# Body Composition Tracker v2

## Project Overview
コンテスト向け体重・栄養管理ダッシュボード。
Streamlit Cloud → Next.js + Supabase + GitHub Actions への移行プロジェクト。

## Architecture

```
Frontend:  Next.js 15 (App Router) + TypeScript → Vercel (Free Tier)
Database:  Supabase (PostgreSQL + Auth + RLS) → 既存プロジェクトを継続利用
ML Batch:  Python (NeuralProphet + XGBoost) → GitHub Actions (日次 cron)
```

### Core Principle
**「計算」と「表示」の完全分離**
- NeuralProphet/XGBoost の学習処理は GitHub Actions の日次バッチで実行
- フロントエンドは事前計算済みの結果を Supabase から取得して描画するだけ
- Python バックエンドサーバーは不要。CRUD は supabase-js で直接実行

## Directory Structure

```
body-comp-tracker-v2/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── page.tsx            # Dashboard (メイン)
│   │   ├── layout.tsx          # Root Layout
│   │   ├── history/page.tsx    # 過去シーズン比較
│   │   ├── settings/page.tsx   # 設定画面
│   │   └── api/                # Route Handlers (必要に応じて)
│   ├── components/             # UIコンポーネント
│   │   ├── dashboard/          # KPI Cards, Summary
│   │   ├── charts/             # ForecastChart, MacroChart, TdeeChart
│   │   ├── meal/               # MealLogger, FoodPicker, Cart
│   │   └── ui/                 # 共通UI (Button, Card, etc.)
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts       # Browser client
│   │   │   ├── server.ts       # Server client (SSR用)
│   │   │   └── types.ts        # DB型定義 (supabase gen types で生成)
│   │   ├── hooks/              # Custom hooks (useDailyLogs, usePredictions, etc.)
│   │   └── utils/              # 計算ヘルパー (TDEE計算, KPI算出)
│   └── styles/
│       └── globals.css         # Tailwind base
├── ml-pipeline/                # Python (GitHub Actions 専用)
│   ├── predict.py              # NeuralProphet バッチ予測
│   ├── analyze.py              # XGBoost 因子分析
│   ├── enrich.py               # TDEE計算・データ加工
│   └── requirements.txt        # Python依存 (neuralprophet, xgboost, supabase)
├── .github/workflows/
│   ├── ml-daily.yml            # 日次バッチ (cron: 毎日 AM 3:00 JST)
│   └── ci.yml                  # Lint + TypeCheck + Build
├── CLAUDE.md                   # このファイル
├── .env.local                  # Supabase URL/Key (gitignore対象)
└── supabase/
    └── migrations/             # DDL管理
```

## Tech Stack & Libraries

### Frontend
- **Framework**: Next.js 15 (App Router, TypeScript)
- **Styling**: Tailwind CSS 4
- **Charts**: Recharts (Plotly からの移行先)
- **Data Fetching**: SWR (stale-while-revalidate)
- **DB Client**: @supabase/supabase-js v2
- **Icons**: Lucide React

### ML Pipeline (Python)
- neuralprophet (体重予測)
- xgboost (因子分析)
- pandas, numpy
- supabase-py (結果書き込み)

## Supabase Tables

### 既存テーブル (変更なし)
- `daily_logs` — log_date(PK), weight, calories, protein, fat, carbs, note
- `food_master` — name(PK), protein, fat, carbs, calories, category
- `menu_master` — name(PK), recipe(JSONB)
- `settings` — key(PK), value_num, value_str

### 新規テーブル (要作成)
- `predictions` — id, ds(DATE), yhat(FLOAT), model_version(TEXT), created_at
- `analytics_cache` — metric_type(PK), payload(JSONB), updated_at

## Coding Standards

### TypeScript
- `strict: true` を必ず有効にする
- 型は `lib/supabase/types.ts` に集約 (`supabase gen types typescript` で生成)
- コンポーネントは関数コンポーネント + Hooks のみ (クラスコンポーネント禁止)
- `any` 型の使用禁止。やむを得ない場合は `unknown` + type guard
- ファイル名: コンポーネントは PascalCase (`KpiCards.tsx`), ユーティリティは camelCase (`calcTdee.ts`)

### React / Next.js
- Server Components をデフォルトにする。`"use client"` は状態管理・イベントハンドラが必要な場合のみ
- データ取得は Server Component で直接 Supabase クエリ、またはクライアント側で SWR
- `app/` 配下の `page.tsx` は薄く保つ (ロジックは components/ や lib/ に分離)
- 環境変数: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Python (ml-pipeline/)
- 型ヒント必須 (`def predict(df: pd.DataFrame) -> pd.DataFrame:`)
- ロギングは `logging` モジュール (`print` デバッグ禁止)
- Supabase への書き込みは upsert を使用 (冪等性の保証)

### Git
- コミットメッセージ: Conventional Commits (`feat:`, `fix:`, `refactor:`, `chore:`)
- ブランチ: `main` → 本番, `dev` → 開発, `feature/xxx` → 機能別

## Migration Notes (旧コードからの参照)

### logic.py → ml-pipeline/
- `enrich_data()` → `enrich.py` (TDEE逆算, SMA計算)
- `run_neural_model()` → `predict.py` (n_lags=0, epochs=500, weekly_seasonality=True)
- `run_xgboost_importance()` → `analyze.py` (特徴量重要度 → analytics_cache に JSONB 保存)
- `run_metabolic_simulation()` → `predict.py` に統合 (ADAPTATION_FACTOR=30)
- `run_linear_model()` → `lib/utils/calcTrend.ts` に移植 (単純な線形回帰はフロント側で可)

### supabase_db.py → lib/supabase/ + lib/hooks/
- `fetch_raw_data()` → `useDailyLogs()` hook (SWR)
- `fetch_food_list()` → `useFoodList()` hook
- `add_daily_log()` → `supabase.from('daily_logs').upsert()`
- キャッシュ戦略: `st.cache_data` → SWR の `revalidateOnFocus` + `dedupingInterval`

### app.py → src/app/ + src/components/
- KPI Cards → `components/dashboard/KpiCards.tsx`
- Tab 1 (Simulator) → メインページ `app/page.tsx` + `components/charts/ForecastChart.tsx`
- Tab 2 (History) → `app/history/page.tsx`
- Tab 4 (Stats) → `components/charts/MacroChart.tsx` + `components/charts/FactorAnalysis.tsx`
- Tab 5 (Metabolism) → `components/charts/TdeeChart.tsx`
- Tab 6 (Database) → `app/foods/page.tsx`
- Tab 7 (Settings) → `app/settings/page.tsx`

## Known Issues to Fix During Migration
1. TDEE計算の係数不一致 (6800 vs 7200) → 定数化して根拠をコメント
2. XGBoost の current_weight リーケージ → 説明変数から除外
3. enrich_data の冪等性 → マージ前に既存列を削除
4. NeuralProphet キャッシュ問題 → バッチ化で根本解決
5. history.csv のローカル依存 → Supabase テーブルに移行

## Commands
- `npm run dev` — 開発サーバー起動
- `npm run build` — 本番ビルド
- `npm run lint` — ESLint 実行
- `npx supabase gen types typescript --project-id <id> > src/lib/supabase/types.ts` — 型生成
