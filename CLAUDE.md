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
│   │   └── utils/              # 計算ヘルパー (TDEE計算, KPI算出, 日付ユーティリティ)
│   └── styles/
│       └── globals.css         # Tailwind base
├── ml-pipeline/                # Python (GitHub Actions 専用)
│   ├── predict.py              # NeuralProphet バッチ予測
│   ├── analyze.py              # XGBoost 因子分析
│   ├── enrich.py               # TDEE計算・データ加工
│   ├── requirements.txt        # Python依存 (neuralprophet, xgboost, supabase)
│   └── requirements-ci.txt     # CI用軽量依存 (supabase 不要)
├── .github/workflows/
│   ├── ml-daily.yml            # 日次バッチ (cron: 毎日 AM 3:00 JST)
│   └── ci.yml                  # Lint + TypeCheck + Build
├── CLAUDE.md                   # このファイル
├── README.md                   # 人間向け入口文書
├── .env.local                  # Supabase URL/Key (gitignore対象)
└── supabase/
    └── migrations/             # DDL管理
```

## Tech Stack & Libraries

### Frontend
- **Framework**: Next.js 15 (App Router, TypeScript)
- **Styling**: Tailwind CSS 4
- **Charts**: Recharts
- **Data Fetching**: SWR (stale-while-revalidate)
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

### 保存まわり
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

### UI / 分析表示
- Macro / TDEE は「記録確認」ではなく「調整判断」画面として扱う
- 実績値だけでなく、差分・前週比・信頼度・解釈導線を重視する
- AI 因子分析は因果ではなく振り返り補助として扱う
  - サンプル不足・欠損時は警告や代替表示を優先する
  - 説明文やラベルの可読性も実装上の責務として扱う
- fallback 可能な画面はページ全体をブロックせず、未計算項目だけ unavailable にする
- NaN や意味不明な空欄をそのまま露出しない

### ml-pipeline
- `enrich.py`: TDEE 推定は `weight_sma7.diff()` + rolling median の平滑化ロジックを前提とする
- `analyze.py` / `enrich.py`: supabase は `main()` 内で遅延 import — トップレベルに戻さない
- キャッシュ: stale / unavailable の状態定義（`analytics_cache` の `status` 区分）を崩さない
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
- データ取得は Server Component で直接 Supabase クエリ、またはクライアント側で SWR
- `app/` 配下の `page.tsx` は薄く保つ (ロジックは components/ や lib/ に分離)
- 環境変数: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Python (ml-pipeline/)
- 型ヒント必須 (`def predict(df: pd.DataFrame) -> pd.DataFrame:`)
- ロギングは `logging` モジュール (`print` デバッグ禁止)
- Supabase への書き込みは upsert を使用 (冪等性の保証)
- トップレベル import は軽量依存のみ。重い外部依存（supabase, xgboost）は遅延 import

### Git
- コミットメッセージ: Conventional Commits (`feat:`, `fix:`, `refactor:`, `chore:`)
- ブランチ: `main` → 本番, `dev` → 開発, `feature/xxx` → 機能別

## Commands
- `npm run dev` — 開発サーバー起動
- `npm run build` — 本番ビルド
- `npm run lint` — ESLint 実行
- `npx supabase gen types typescript --project-id <id> > src/lib/supabase/types.ts` — 型生成
