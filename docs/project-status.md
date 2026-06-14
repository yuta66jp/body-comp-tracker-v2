# Project Status

## 現在の位置づけ

本プロジェクトは、主要な実装フェーズを一旦完了した。
現時点では新機能の追加を急がず、一定期間を運用期間として扱う。

この運用期間では、日々の記録と画面利用を通じて、現在の入力・保存・表示・集計が安定しているかを確認する。
目的はモデルの高度化を直ちに進めることではなく、今後の改善に必要なデータと判断材料を蓄積することにある。

---

## 運用期間の目的

運用期間の主目的は以下の通り。

1. 日次記録が無理なく継続できることを確認する
2. 入力項目の欠損や偏りを把握する
3. 現在の TDEE・予測・データ品質表示が実運用上十分かを確認する
4. 今後の改善判断に必要な材料を整える

短期体重の要因分析は現行運用では確認しないため、XGBoost 因子分析と SHAP ベース説明は扱わない。

---

## 想定する運用期間

運用期間は以下を目安とする。

- 最低: 8週間
- 推奨: 12週間

8週間は、入力継続性・欠損傾向・基本的な利用パターンを確認するための最低ラインとする。
12週間は、予測精度・TDEE 判断・記録品質の改善余地を見極めるための、より現実的な判断期間とする。

この期間中は、短期的な見た目の改善やモデル高度化よりも、記録品質と実運用の安定性を優先する。

---

## 当面の方針

### 1. 短期体重要因分析・SHAP は非採用

短期体重の要因分析は実運用で確認しないため、XGBoost による AI 因子分析は #720 で削除済みとする。
`analytics_cache` の `xgboost_importance` は今後 read / write しない。

SHAP ベース説明も将来課題ではなく、実装しない方針とする。
説明ロジックの高度化ではなく、TDEE、予測精度、データ品質、記録継続性の改善を優先する。

#### 観測フィールドの整理状況（#435 / #443 / #444 / #501 / #710）

歩数・睡眠・断食時間の旧スキーマは #710 で整理した。
現行では、入力コストが高く精度も安定しない断食時間は廃止し、歩数・睡眠系データは Google Health に統合している。

| フィールド | 概要 | DB 列 |
|---|---|---|
| 体重 | Google Health の体重ログから同期。手動入力も同じ列を使う | `daily_logs.weight` |
| 歩数 | Google Health から同期 | `google_health_daily_metrics.step_count` |
| 睡眠時間 | Google Health の睡眠セッションから同期 | `google_health_daily_metrics.sleep_minutes` |
| 深睡眠 | Google Health の sleep summary / stages から同期 | `google_health_daily_metrics.deep_sleep_minutes` |
| 就寝・起床 | Google Health の sleep interval から同期 | `google_health_daily_metrics.sleep_bed_at`, `google_health_daily_metrics.sleep_wake_at` |
| HRV / 安静時心拍数 | Google Health の日次メトリクスから同期 | `google_health_daily_metrics.hrv_ms`, `google_health_daily_metrics.rhr_bpm` |

Google Health 指標は直近ログ、カレンダー、月別サマリー、週間レビュー、CSV export で参照できる。
`daily_logs.step_count` / `daily_logs.sleep_hours` / `daily_logs.last_meal_end_time` / `sleep_sessions` は削除済み。

詳細: `docs/step-count-and-fasting-hours.md`

### 2. read projection / window 最適化

read projection / window 最適化は現時点では保留とする。

これは今すぐ着手すべき固定課題ではなく、実際の運用でどの画面がよく使われるか、どの集計期間が実用的か、どこに読み取りや表示の無駄があるかを見てから判断する。

そのため、先に最適化方針を細かく決めるのではなく、運用期間中の利用実態を踏まえて必要性を再評価する。

---

### 3. 予測モデルの段階的改善（データ蓄積後）

予測モデルの改善は、運用期間中のクリーンデータ蓄積を前提とする。
一度にまとめて改良するのではなく、バックテストサンプル数に応じて段階的に進める。

投入判断の目安:
- 50日以上のクリーンデータ蓄積後: バックテスト再実行・Bias 値の再評価
- 80日以上: Horizon 別モデル選択・Bias 補正の導入検討
- 100日以上: 加重アンサンブル・D+60/D+90 horizon の精度評価

#### 実施済み（2026-03-29）

ロードマップ Phase 1 の表示改善と CLI 拡張準備をすべて完了した。

- **到達予測の透明化**（#397）: `goalReachResult` / `bufferDays` の算出を page.tsx に一本化。バッファ日数を KPI カードに表示、GoalNavigator は本来の役割に整理
- **%BW/週トラッキング**（#402 / #403）: WeeklyReview に `bwRatePctPerWeek` と Helms 2014 バンド別ステータスを追加。重複していた「14日トレンド」kg/週行を削除
- **TDEE 7日ローリング平均メイン化**（#407 / #408）: TDEE グラフで `avg_tdee_7d` をメイン表示、日次値を補助線に変更。canonical batch 参照 / 旧バッチ互換 fallback / frontend-computed の参照経路をコード上で区画化
- **backtest workflow 拡張**（#409）: `ml-backtest.yml` に `horizons` 入力を追加（デフォルト `7,14,30`、手動で `60,90` を追加指定可能）。週次の schedule 実行は従来どおり

モデルロジックの変更は行っていない。Phase 2（クリーンデータ50日到達後）までモデル側は凍結。

詳細な分析・ロードマップは [`docs/forecast-model-analysis-and-roadmap.md`](forecast-model-analysis-and-roadmap.md) を参照。

---

### 4. 睡眠機能の発展候補（運用期間後に再評価）

睡眠時間の記録基盤は Google Health に統合済みであり、`google_health_daily_metrics.sleep_minutes` / `sleep_bed_at` / `sleep_wake_at` を表示・集計に使う。
週次サマリー、カレンダー、月別サマリー、心肺機能指標の表示も Google Health 由来に整理済み。

以下の機能候補は、現時点では実装対象としない。運用期間中のデータ蓄積と利用実態を踏まえて、必要性を再評価する。

| 候補 | 概要 |
|---|---|
| 睡眠充足ステータスの精緻化 | 目安（7〜9h）による簡易分類から、過去平均との比較など個人内変動に基づく評価への発展 |
| 平均就寝時刻 / 平均起床時刻 | 週次サマリーや月次カレンダー上で就寝・起床リズムを俯瞰 |
| 睡眠のばらつき可視化 | 睡眠時間の週内ばらつきを指標として扱う |
| 睡眠 × readiness の相関 | 睡眠時間と週次ペース・体調判断との関係を分析 |

再評価の前提条件:
- 睡眠記録が一定期間（推奨: 8〜12週）継続されていること
- 入力欠損率が許容範囲内であること
- 上記の可視化が実運用上の判断改善につながるかを確認できること

---

## 運用期間中に優先すること

運用期間中は、以下を優先する。

- 記録が継続できること
- 入力・保存・表示が安定していること
- 既存画面が実運用上十分に見やすいこと
- 将来の分析改善に必要なデータが自然に蓄積されること

逆に、以下は優先度を下げる。

- 早期のモデル高度化
- 短期体重要因分析の再導入
- 説明機能の複雑化
- 利用実態が見えない段階での最適化

---

## 次の判断ポイント

運用期間の終了後、以下を再評価する。

1. read projection / window 最適化が本当に必要か
2. 実運用で支障となる UI / UX や集計上の課題が残っていないか
3. 予測モデルの改善（クリーンデータ50日到達後にバックテスト再実行・Bias 再評価）
4. 睡眠機能の発展候補（就寝・起床リズム / ばらつき可視化 / readiness との関係）をどの順で検討するか

これらは一括で進めるのではなく、必要に応じて個別 Issue として切り出して管理する。

---

## 補足

本ドキュメントは、現在の開発ステータスと中期方針を整理するためのものである。
個別のバグ、改善タスク、実装単位の検討事項は Issue で管理する。

---

## 関連ドキュメント

| ドキュメント | 内容 |
|---|---|
| [`docs/forecast-model-analysis-and-roadmap.md`](forecast-model-analysis-and-roadmap.md) | バックテスト結果の詳細分析・予測モデルの改善ロードマップ（Phase 1〜4）|
| [`docs/daily-logs-read-inventory.md`](daily-logs-read-inventory.md) | daily_logs の read API 利用箇所棚卸し・query 分割方針 |
| [`docs/step-count-and-fasting-hours.md`](step-count-and-fasting-hours.md) | 旧歩数・断食・睡眠スキーマの整理と Google Health 移行後の現行方針 |
| [`docs/apple-health-step-export.md`](apple-health-step-export.md) | 旧 Apple Health ZIP → 日次歩数 CSV/JSON 変換ツールの使い方 |
| [`docs/long-event-policy-design.md`](long-event-policy-design.md) | 長期イベント区間を考慮した予測評価・予測生成ポリシーの親テーマ設計（#479） |
| `CLAUDE.md` | プロジェクト全体の設計方針・実装原則・非目標 |
