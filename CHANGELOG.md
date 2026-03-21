# CHANGELOG

記録形式: [Keep a Changelog](https://keepachangelog.com/ja/1.0.0/) に準拠。
バージョン番号は定義せず、時系列で管理する。

---

## 2026-03 — モバイルUI最適化

主要ページのスマホ表示を見直し、閲覧性・操作性・導線を改善。

### 追加

- **モバイル下部タブバー** (#173) — 画面下部に固定タブバーを追加。ダッシュボード・TDEE・Macro・Foods・設定への移動を片手で行いやすく
- **モバイル共通レイアウト基盤** (#180) — `PageShell` / `BottomSpacer` / `TableScroll` を整備。ページ間で余白・固定UI・横スクロール処理を統一
- **History モバイル比較UI** (#175) — シーズン比較アコーディオン・今日時点の比較カードをモバイル向けに追加。重要比較を先に把握しやすい構成に再設計
- **TDEE / Macro 日次カード表示** (#176) — `TdeeDailyTable` / `MacroDailyTable` にモバイル向けカードビューを追加。横スクロール依存を解消
- **Foods モバイルカード表示** (#177) — 食品マスタ・セットメニューをスマホ向けカード表示に対応。検索バーをページ先頭に配置する検索主導レイアウトに変更
- **Forecast Accuracy モバイル要約** (#179) — ベストモデルカードの縦積み対応・ホライズン別要約カード・詳細テーブルのモバイルカード化を追加

### 改善

- **ダッシュボードのモバイル導線** (#174) — 入力フォームを折りたたみ表示に変更。KPI・ゴールガイド・週次レビューを先に確認できる導線に整理
- **Settings のセクション分割・保存導線** (#178) — 設定画面を4セクション（シーズン / 目標・身体情報 / 目標マクロ / 月次計画）に分割しアコーディオン化。保存ボタンをモバイル下部に固定表示

---

## 2026-03 — データ品質・保存基盤の整備

### 追加

- **had_bowel_movement 三状態化** — DB を `BOOLEAN DEFAULT NULL` に移行。`null=未記録 / false=便通なし / true=便通あり` の意味論を保存から分析まで貫通させた
- **データ品質レポート** — 設定ページに直近7日 / 14日の欠損・異常値を自動検出するパネルを追加
- **atomic 保存（RPC）** — `save_daily_log_partial` RPC による atomic upsert に移行。fetch-then-upsert の競合を排除
- **EWLinearTrend モデル** — バックテスト比較に指数加重線形トレンドモデルを追加

### 改善

- **daily_logs 部分更新安全化** — 未操作フィールドを上書きしない保存ロジックに統一（`undefined=未操作 / null=明示クリア / 値=上書き`）
- **日付基準の統一** — 残り日数・週次比較の計算を JST 基準で統一（`calcDaysLeft` / `toJstDateStr` / `parseLocalDateStr`）
- **QueryResult<T> 導入** — 主要クエリに discriminated union（`kind: "ok"` / `kind: "error"`）を適用。DB エラーと正常な空状態を型レベルで分離

---

## 2026-02〜03 — 分析・ML 基盤の整備

### 追加

- **feature_registry.py** — 因子分析の特徴量定義を単一ソースに集約。`analyze.py` は `active_feature_cols()` / `active_feature_labels()` 経由でのみ参照
- **featureLabels.ts 同期検証** — `TestActiveFeatureNamesSync` により Python 側と TypeScript 側の特徴量名の一致を CI で自動検知
- **backtest 実験基盤** — `backtest.py` が CLI オプション（`--series-type` / `--max-origins` / `--horizons` 等）で実験条件を制御可能に
- **月次目標計画（buildMonthlyGoalPlan）** — 大会日・目標体重から月末目標を自動配分。手動 override（upsert 方式）と線形再配分に対応
- **TDEE batch canonical 化** — フロント再計算を廃止。`enrich.py` が算出した値を canonical として表示

---

## 初期実装（2026-01〜02）

- Next.js 15 (App Router) + Supabase によるアプリ基盤構築
- 日次ログ記録（体重・Macro・コンディション）
- ダッシュボード / TDEE / Macro / History / Foods / Settings 各画面の初期実装
- NeuralProphet による体重予測（GitHub Actions 日次バッチ）
- XGBoost による AI 因子分析
- Vercel へのデプロイ・GitHub Actions CI 設定
