# body-comp-tracker-v2

個人利用のボディメイク / 体重管理アプリ。
減量・大会準備の進捗判断と振り返りを目的として使用する。
単なる記録ではなく、「何を調整すべきか」が読み取れることを重視している。

## 主要機能

### 日次ログ記録

- 体重
- Macro（カロリー・タンパク質・脂質・炭水化物）
- コンディション：睡眠時間・便通・トレーニング種別・勤務モード
- メモ
- ※ leg_flag は training_type から自動導出（直接入力なし）

### ダッシュボード

- **KPI カード**: 現在体重・残り日数（週数）・目標到達予定日
- **GoalNavigator**: 「このままで間に合うか」の判断パネル
  - 体重進捗（現在 / 目標 / 残り kg）
  - ペース分析（必要ペース vs 実績ペース、単位: kg/2週）
  - 調整提案（推奨カロリー調整 + 理由の一行説明）
- **WeeklyReview**: 直近7暦日の実績振り返り（体重・栄養・エネルギーバランス・停滞検知）
- 3 パネルの役割は分離しており、同じ意味の数値が重複して表示されない

### Macro 画面

- 週平均カロリー・PFC の目標差分
- 前週比
- PFC kcal 比率
- 直近7記録日の平均（集計期間を画面上で明示）

### TDEE 画面

- 平均摂取カロリー
- 実測 TDEE（ML バッチが算出した推定値を表示。フロントで再計算しない）
- 収支差分
- 理論変化 / 実測変化
- 信頼度表示
- batch 側で算出・平滑化した canonical な TDEE 値を表示する前提

### AI 因子分析

- XGBoost による翌日体重変化量への特徴量重要度（解釈補助テキストあり）
- **因果を断定するものではなく、振り返り補助として使用する**
- サンプル数・欠損状況によって解釈に注意が必要
- データ不足時は警告 / 表示抑制を行う

### stability 指標について

- **stability** は feature importance がデータの微小な変動でどの程度変わるかを示す補助指標
- **high**: ほぼ安定して同じ特徴量が重要と判定される
- **medium**: ある程度安定しているが、解釈には注意が必要
- **low**: データの揺らぎによって重要度が変わりやすく、強い解釈は避ける
- importance が高くても stability が低い場合、偶然の相関や小サンプルの影響を受けている可能性がある

### 設定（Settings）

- 目標体重・大会日付・TDEE 設定などを管理
- 保存は Server Action + shared schema（zod）で一元処理
- 読み取りは typed domain model（AppSettings）に変換して利用
- UI integration test（jsdom）で保存導線・fallback 導線を自動検証

### fallback 表示

- データ未取得・未計算の項目はページ全体を止めず、該当項目のみ unavailable 表示にする

## 最近の改善（実装済み）

| 項目 | 内容 |
|---|---|
| 保存安全性 | daily_logs の部分更新を安全化（未操作フィールドを上書きしない） |
| 日付基準統一 | 残り日数・週次比較の計算を JST 基準で統一（`calcDaysLeft` / `toJstDateStr`） |
| settings 統一 | Server Action + shared schema（zod）で保存。typed AppSettings で読み取り |
| query layer | Supabase read 系ロジックを `src/lib/queries/` に集約 |
| UI integration tests | 保存導線・fallback 導線を jsdom ベースで自動検証 |
| TDEE batch canonical | フロント再計算を廃止。enrich.py が算出した値を canonical として表示 |
| ダッシュボード整理 | KPI 重複を削減。GoalNavigator を判断ロジック中心に再整理 |
| ペース分析単位統一 | kg/2週 を primary 単位に統一（GoalNavigator / calcReadiness）|
| KPI 定義注記 | 各 KPI に期間定義・推定値区別・fallback 説明を追加 |
| nullable UX | three-state（未操作 / 明示値 / 明示クリア）の整合性を確認・整備 |
| ml-pipeline 保守性 | analyze.py / enrich.py の import 境界を整理（supabase を遅延 import 化） |

## 今後の方向性

**直近の基盤整備は完了。今後はデータ蓄積後の分析拡張を慎重に進める。**

### データ蓄積後の課題

- 因子分析の特徴量拡張（sleep_hours / had_bowel_movement / training_type / work_mode / leg_flag）
  - 現時点ではサンプル不足・欠損率・カテゴリ偏りにより解釈が不安定になりやすい
  - データが十分に蓄積された段階で着手する

## Tech Stack

| Layer | Stack |
|---|---|
| Frontend | Next.js (App Router) + TypeScript + Tailwind CSS 4 |
| Database | Supabase (PostgreSQL + RLS) |
| Charts | Recharts |
| ML batch | Python — NeuralProphet, XGBoost (GitHub Actions, 日次 cron) |

## ローカル開発

1. `.env.local` に Supabase の接続情報を設定する。
2. 依存インストールと開発サーバー起動:

```bash
npm install
npm run dev
```

3. コミット前の確認:

```bash
npm run lint
npx tsc --noEmit
npm run build
```

4. テスト実行（unit tests + UI integration tests）:

```bash
node_modules/.bin/jest --no-coverage
```

ML バッチ (`ml-pipeline/`) は `SUPABASE_URL` と `SUPABASE_SERVICE_ROLE_KEY` が必要。
GitHub Actions で実行することを前提としており、ローカル実行は原則行わない。
