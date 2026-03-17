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

**便通の記録について**
`had_bowel_movement` は三状態（`null` = 未記録 / `false` = 便通なし / `true` = 便通あり）で管理している。
DB は `BOOLEAN DEFAULT NULL` に移行済み。
「未記録」と「便通なし」を区別した集計・分析が可能。

**`is_poor_sleep` について**
現在 UI 入力は廃止済み。睡眠の質評価は `sleep_hours`（睡眠時間）に移行している。
過去データに存在した `FALSE` 値は未記録由来で「睡眠不足なし」と混同されるため `NULL` に補正済み。
現時点では condition 系特徴量の投入候補には含めない。
再導入する場合は `NULL` = 未記録 / `TRUE` = 睡眠不足あり / `FALSE` = 睡眠不足なし の三状態で設計すること。

### ダッシュボード

上部 3 パネル（KpiCards / GoalNavigator / WeeklyReview）と、下部タブ切替セクションで構成される。

**上部 3 パネル**

- **KPI カード**: 現在体重・残り日数（週数）・目標到達予定日
- **GoalNavigator**: 「このままで間に合うか」の判断パネル
  - 体重進捗（現在 / 目標 / 残り kg）
  - ペース分析（必要ペース vs 実績ペース、単位: kg/2週）
  - 調整提案（推奨カロリー調整 + 理由の一行説明）
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
- **月別サマリー**: 月単位の集計サマリー

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

- **月次目標体重ライン**: 3 タブすべてに表示。`monthlyTarget` を ReferenceLine として描画
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
- 収支差分
- 理論変化 / 実測変化
- 信頼度表示
- batch 側で算出・平滑化した canonical な TDEE 値を表示する前提

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
- 保存は Server Action + shared schema（zod）で一元処理
- 読み取りは typed domain model（AppSettings）に変換して利用
- UI integration test（jsdom）で保存導線・fallback 導線を自動検証

### fallback 表示

- データ未取得・未計算の項目はページ全体を止めず、該当項目のみ unavailable 表示にする
- DB フェッチエラー（`kind: "error"`）と「まだデータがない」（`kind: "ok"` で空）は別扱い。
  エラー時はページ上部にエラーバナーを表示しつつコンテンツを graceful degradation させる。

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
| settings 統一 | Server Action + shared schema（zod）で保存。typed AppSettings で読み取り |
| query layer | Supabase read 系ロジックを `src/lib/queries/` に集約。主要クエリは `QueryResult<T>` で状態を明示し、補助的なクエリ（career_logs-for-dashboard / predictions 等）はベストエフォートで空配列フォールバック。意図を JSDoc に明記 |
| UI integration tests | 保存導線・fallback 導線を jsdom ベースで自動検証 |

### CI

| 項目 | 内容 |
|---|---|
| TypeScript | lint / tsc / jest / build を CI で自動検証 |
| Python | pytest で `test_analyze.py` / `test_enrich.py` / `test_feature_registry.py` / `test_backtest.py` を CI 監視 |

---

## 今後の方針

### condition 系特徴量の段階投入（データ蓄積後）

`sleep_hours` / `had_bowel_movement` / `training_type` / `work_mode` / `leg_flag` は
`feature_registry.py` に `active=False` で登録済み。

現時点での保留理由:
- サンプル数不足
- カテゴリ偏り（特定 training_type が少ない等）
- 欠損率が高い項目あり（sleep_hours など）

これらが解消されたタイミングで `active=True` に変更し、
`featureLabels.ts` の `ACTIVE_FEATURE_NAMES` と `ACTIVE_FEATURE_EXPLANATIONS` に追記することで
フロント表示まで自動で整合する。

### SHAP ベース説明への移行（将来課題）

現在の因子分析は XGBoost の `feature_importances_`（重要度の大きさのみ）を使用している。
SHAP（各予測への寄与量）は個別サンプルへの説明力が高く、将来の移行候補として
`feature_registry.py` の `encoder_hint` に想定設計を残している。

現時点では未実装。移行する場合は `analyze.py` の `run_importance()` を差し替える想定で、
`feature_registry.py` 自体は変更不要な設計になっている。

### read projection / window 最適化（現時点では保留）

`fetchDailyLogs()` 等は現在全カラム・全期間取得をしている。
個人利用かつレコード数が現時点では問題にならない規模のため、最適化は保留中。
パフォーマンス問題が実際に現れた時点で対応する。

---

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
