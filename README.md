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

### Macro 画面

- 目標差分（タンパク質・脂質・炭水化物の充足率）
- 前週比
- PFC バランス確認

### TDEE 画面

- 平均摂取カロリー
- 実測 TDEE（SMA7 ベースの平滑化推定）
- 収支差分
- 理論変化 / 実測変化
- 信頼度表示

### 週次 / 振り返り

- KPI カード（残り日数・目標達成率）
- 過去シーズン比較（history ページ）

### AI 因子分析

- 翌日体重変化量に対する各栄養素の相関ベースの重要度可視化
- XGBoost による特徴量重要度（解釈補助テキストあり）
- **因果を断定するものではなく、振り返り補助として使用する**
- サンプル数・欠損状況によって解釈に注意が必要
- データ不足時は警告 / 表示抑制を行う

### stability 指標について

- **stability** は feature importance がデータの微小な変動でどの程度変わるかを示す補助指標です
- **high**: ほぼ安定して同じ特徴量が重要と判定されます
- **medium**: ある程度安定していますが、解釈には注意が必要です
- **low**: データの揺らぎによって重要度が変わりやすく、強い解釈は避けてください
- importance が高くても stability が低い場合、偶然の相関や小サンプルの影響を受けている可能性があります
- stability はデータが十分に蓄積された段階でより信頼できる指標になります

### fallback 表示

- データ未取得・未計算の項目はページ全体を止めず、該当項目のみ unavailable 表示にする

## 最近の改善（実装済み）

| 項目 | 内容 |
|---|---|
| 保存安全性 | daily_logs の部分更新を安全化（未操作フィールドを上書きしない） |
| 日付基準統一 | 残り日数・週次比較の計算を JST 基準で統一 |
| 判断 UI 化 | Macro / TDEE を「記録確認」から「調整判断」画面として整理 |
| コンディション記録 | sleep_hours / had_bowel_movement / training_type / work_mode を統合 |
| AI 因子分析の解釈性改善 | ラベル・説明文の整備、サンプル不足時の警告を追加 |
| TDEE 推定の平滑化 | weight_sma7.diff() + rolling median による頑健化 |
| キャッシュ整理 | stale / unavailable の状態を明示化、再計算反映タイミングを整理 |
| nullable UX | three-state（未操作 / 明示値 / 明示クリア）の整合性を確認・整備 |
| ml-pipeline 保守性 | analyze.py / enrich.py の依存整理（supabase を遅延 import 化） |

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

ML バッチ (`ml-pipeline/`) は `SUPABASE_URL` と `SUPABASE_SERVICE_ROLE_KEY` が必要。
GitHub Actions で実行することを前提としており、ローカル実行は原則行わない。
