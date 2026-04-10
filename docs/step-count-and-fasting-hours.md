# 歩数・空腹時間・推定睡眠時間の記録と今後の方針

本ドキュメントは、#435（空腹時間）・#443/#444（歩数）・#501（就寝時刻 / 推定睡眠時間）で追加した観測フィールドについて、
目的・入力方法・保存範囲・現在の非目標・今後の分析利用方針を整理したものである。

---

## 1. 歩数記録（step_count）

### 目的

歩数は消費カロリーに直接影響する生活活動量の指標であり、体重変化や TDEE 推定に対して条件制御に使える可能性がある。
現時点では「まずデータを蓄積する」フェーズであり、可視化や分析モデルへの投入はまだ行わない。

### DB 保存場所

```
daily_logs.step_count  (INTEGER, nullable)
```

- 未入力・未インポートの日は `NULL` のまま保持する
- `NULL` と 0 は別の意味として扱う（`NULL` = 未記録、`0` = 記録あり・歩数ゼロ）
- `daily_logs` に体重記録がない日はインポート対象外（新規行を生成しない）

### 入力方法

手動入力 UI は設けていない。Apple Health の記録を以下の 2 段階で取り込む。

#### Step 1: ローカル変換ツールで抽出

```bash
python ml-pipeline/extract_steps.py ~/Downloads/export.zip
# → daily_steps.csv を生成
```

- Apple Health ZIP → `HKQuantityTypeIdentifierStepCount` のみを抽出・日次集計
- 詳細手順: `docs/apple-health-step-export.md`

#### Step 2: アプリの設定画面からインポート

1. 設定画面 → 「歩数インポート（CSV / JSON）」セクション
2. `daily_steps.csv` または `daily_steps.json` を選択
3. preflight 画面で件数確認（新規書き込み / 上書き / スキップ件数）
4. 確認後に実行

インポートロジック（`/api/step-import`）の仕様:
- `date,step_count` 形式の CSV と `[{date, step_count}]` 形式の JSON に対応
- 不正な日付・非整数・負値はスキップしてカウント
- 重複日付は後勝ち
- 既存 `daily_logs` がある日のみ更新（新規行は作らない）

### 現在の表示範囲

専用の歩数表示 UI（グラフ・サマリー）はない。
インポート画面では以下の範囲で件数を確認できる。

| タイミング | 表示内容 |
|---|---|
| preflight（実行前確認） | 新規書き込み件数 / 上書き件数 / スキップ件数 |
| 完了バナー | 保存された日数 / スキップ件数 |

保存された実際の歩数値は設定画面の CSV エクスポートで `step_count` 列を確認する。

### 現時点の非目標

- 歩数グラフや統計サマリーの表示 UI
- 歩数と体重・カロリーの相関分析表示
- 勤務形態別・トレーニング別の歩数比較
- 予測モデルへの特徴量投入
- SHAP による因子説明
- 自動同期や定期インポートの自動化

---

## 2. 空腹時間記録（fasting_hours）

### 目的

空腹時間（体重測定前の絶食時間）は、測定体重に影響する交絡変数のひとつである。
同じ食事量・活動量でも空腹時間が長いほど測定体重は低くなりやすく、日次体重の変動を解釈する際の補足情報として使える可能性がある。
現時点では「まずデータを蓄積する」フェーズであり、分析モデルへの投入はまだ行わない。

### DB 保存場所

空腹時間は DB には直接保存しない。算出に使う 2 つの時刻フィールドを保存する。

```
daily_logs.last_meal_end_time  (TIME, nullable)  # 当日の最後の食事終了時刻
daily_logs.weigh_in_time       (TIME, nullable)  # 体重測定時刻
```

- 両フィールドとも未入力は `NULL`
- 空腹時間は「前日の `last_meal_end_time`」→「当日の `weigh_in_time`」の差分として算出する
- 時刻のみを扱い、タイムゾーン情報は持たない（入力した現地時刻をそのまま使用）

### 入力方法

MealLogger（ダッシュボードのログ入力シート）から手動入力する。

| フィールド | 入力欄 | 例 |
|---|---|---|
| `last_meal_end_time` | 「最後の食事終了時刻」（HH:MM） | `22:30` |
| `weigh_in_time` | 「体重測定時刻」（HH:MM） | `07:00` |

どちらも任意入力。未入力の場合は当日・または翌日の空腹時間を表示しない。

### 算出ロジック

```
空腹時間(D) = 当日 D の weigh_in_time − 前日 D-1 の last_meal_end_time
```

- 日をまたぐ（`weigh_in_time < last_meal_end_time`）場合は +24h で補正する
- 前日ログが存在しない場合は `null`（表示なし）
- 前日 `last_meal_end_time` が未入力の場合は `null`
- 当日 `weigh_in_time` が未入力の場合は `null`
- 算出結果が 24h 以上の場合は異常値として `null` を返す
- 実装: `calcFastingHours()` in `src/lib/utils/calendarUtils.ts`

### 表示範囲

算出された空腹時間は以下の 2 箇所に表示される。

| 表示箇所 | 表示形式 | 例 |
|---|---|---|
| ダッシュボード「直近ログ」テーブル（デスクトップ） | `断食Nh` または `断食N.Mh` | `断食8.5h` |
| ダッシュボード「直近ログ」カードリスト（モバイル） | 同上 | `断食8.5h` |
| ダッシュボード「カレンダー」タブ（デスクトップ） | セル内に `断食Nh` 表示（`hidden sm:block`、モバイルでは非表示） | `断食8.5h` |

### 現時点の非目標

- 空腹時間の推移グラフや統計サマリーの表示 UI
- 空腹時間と体重変化の相関分析
- 目標空腹時間の設定や達成判定
- 予測モデルへの特徴量投入
- SHAP による因子説明

---

## 3. 睡眠時間（sleep_sessions）

> #514〜#517 で sleep モデルを `sleep_sessions` テーブルへ移行済み。
> 旧モデル（`daily_logs.bed_time` → `deriveSleepHours()` → `daily_logs.sleep_hours`）は #529 で廃止済み。

### 目的

睡眠時間は体重変化・回復・食欲に影響しうる条件変数のひとつである。
現時点では「まずデータを蓄積する」フェーズであり、分析モデルへの投入はまだ行わない。

### source of truth と projection の関係

睡眠の source of truth は `sleep_sessions` テーブル（#514/#515 で移行済み）。

```
sleep_sessions.bed_at    (TIMESTAMPTZ)  # 就寝日時（日付+時刻+TZ）— source of truth
sleep_sessions.wake_at   (TIMESTAMPTZ)  # 起床日時（日付+時刻+TZ）— source of truth
sleep_sessions.wake_date (DATE)          # 起床日。daily_logs.log_date と同値の結合キー
```

`daily_logs.sleep_hours` は DB トリガー（`trg_sync_sleep_hours`）が `sleep_sessions` の INSERT/UPDATE/DELETE 後に自動同期する **projection 値**。直接書き込まない。

```
daily_logs.sleep_hours  (REAL, nullable)  # projection 値。DB トリガーが管理
```

`daily_logs.bed_time` は #529 で廃止済み。就寝日時は `sleep_sessions.bed_at` を参照する。

### 起床日基準（#507, #514）

睡眠セッションの「どの日の記録か」は **起床日（wake_date）** を canonical とする。
`weight` / `weigh_in_time` / `fasting_hours` など他のフィールドと同じ軸で読める。

ユーザーは「起床後に、その朝に終わった睡眠セッションを当日の画面に入力する」。
今夜の就寝を事前に入力する UI は持たない。

| 就寝 | 起床 | log_date (= wake_date) | 入力タイミング |
|---|---|---|---|
| 2026-04-07 23:30 | 2026-04-08 07:00 | 2026-04-08 | 4/8 の朝に 4/8 の画面で入力 |
| 2026-04-08 01:30 | 2026-04-08 08:00 | 2026-04-08 | 4/8 の朝に 4/8 の画面で入力 |
| 2026-04-08 23:00 | 2026-04-09 08:00 | 2026-04-09 | 4/9 の朝に 4/9 の画面で入力 |

### 入力方法

MealLogger（ダッシュボードのログ入力シート）の「睡眠」セクションから手動入力する（#516）。

| 入力欄 | 例 | 説明 |
|---|---|---|
| 就寝時刻（昨夜〜深夜） | `23:30` | 昨夜〜当日深夜の就寝時刻（HH:MM） |
| 起床時刻（今朝） | `07:00` | 今朝の起床時刻（HH:MM） |

- 就寝時刻・起床時刻は **セットで入力** する。片方だけでは保存されない（バリデーションあり）
- `bed_at` の日付は保存基盤（`buildSleepSessionDatetimes`）が自動判定する（就寝時刻 > 起床時刻 → 前日就寝）
- `weigh_in_time`（体重測定時刻）とは独立したフィールド
- 既存記録がある日は「記録を削除」ボタンでセッション単位削除が可能

### 睡眠時間の算出

```
睡眠時間 = wake_at − bed_at  （TIMESTAMPTZ 差分）
```

- TIMESTAMPTZ 同士の差分のため日をまたいでも補正不要
- 小数点第1位に丸める（例: 7h 23min → 7.4h）
- DB トリガー（`trg_sync_sleep_hours`）が算出して `daily_logs.sleep_hours` へ書き込む
- 実装: `supabase/migrations/20260408000000_create_sleep_sessions.sql`
- UI 入力フィードバック用の算出: `buildSleepSessionDatetimes()` / `calcSleepDurationHours()` in `src/lib/utils/sleepSession.ts`

### 表示範囲

睡眠時間は以下の箇所に表示される（#517）。

| 表示箇所 | 表示形式 | 例 |
|---|---|---|
| ダッシュボード「直近ログ」テーブル（デスクトップ） | `睡眠Nh` または `睡眠N.Mh` | `睡眠7.4h` |
| ダッシュボード「直近ログ」カードリスト（モバイル） | 同上 | `睡眠7.4h` |

表示元は `daily_logs.sleep_hours`（projection 値）。source of truth は `sleep_sessions`。
「この日の睡眠」= wake_date = log_date の行の朝に終わった睡眠セッションを指す。

### 既存データの扱い

- `#515` 以前に `bed_time` / `weigh_in_time` 差分で算出・保存されていた `sleep_hours` はそのまま残存する
- 新規入力は MealLogger → `sleep_sessions` → DB トリガー経路で起床日基準に揃う
- `daily_logs.bed_time` カラムは #529 で廃止済み（migration: `20260411000000_drop_bed_time_from_daily_logs.sql`）

### 現時点の非目標

- 睡眠時間グラフや統計サマリーの表示 UI
- 睡眠時間と体重変化・パフォーマンスの相関分析
- 睡眠の質・深睡眠などの詳細な記録
- nap（昼寝）や分割睡眠の記録（将来拡張として schema は備える）
- Apple Health からの自動インポート（将来拡張。`source` カラムで区別可能な設計）
- 予測モデルへの特徴量投入（データ蓄積後に判断）
- SHAP による因子説明

---

## 4. 今後の分析利用方針

### 基本方針: まずデータを蓄積する

歩数・空腹時間・推定睡眠時間ともに、まず一定期間の継続記録を優先する。
分析モデルへの投入は、以下の条件を確認してから判断する。

- 欠損率が許容範囲内か（特定の曜日・期間に偏っていないか）
- 入力が継続できているか
- 値の分布に著しい偏りがないか
- 分析・解釈に使えるだけの意味があるか

### condition 系特徴量候補としての位置づけ

現時点で `feature_registry.py` に登録されている condition 系特徴量候補は以下のとおり（すべて `active=False`）。

```
sleep_hours, had_bowel_movement, leg_flag, training_type, work_mode
```

歩数（`step_count`）・空腹時間（`fasting_hours` として算出）・推定睡眠時間（`sleep_hours` として保存）は、これらの後続候補として検討対象になりうる。

ただし、今回の実装では `feature_registry.py` への登録は行っていない。
登録・投入判断は「データ蓄積後の再評価フェーズ」で行う。

### 段階投入の考え方

condition 系特徴量の段階投入方針（`docs/project-status.md` 参照）に準拠する。
歩数・空腹時間についても以下を確認してから投入を判断する。

1. 十分な期間・件数のデータが蓄積されているか
2. 現行の特徴量群が安定しているか（先行する condition 特徴量の投入状況）
3. 欠損の扱い方針が整理されているか（欠損が多い特徴量を安易に投入しない）
4. `feature_registry.py` と `featureLabels.ts` の同期を維持できるか

### 注意事項

- 空腹時間は「体重測定条件の交絡変数」として扱う。それ以上の解釈を過度に加えない
- 歩数は「生活活動量の proxy」として扱う。一日の総消費カロリーとの直接比較はしない
- 推定睡眠時間は「就寝〜起床の近似値」であり、睡眠計測ではない。過度に精度を求めない
- いずれも欠損があっても分析全体を壊さない設計にする（欠損は欠損として扱う）
- 未入力は `NULL` として扱う。推定値や自動補完を安易に埋めない

---

## 関連ドキュメント・ファイル

| 対象 | 場所 |
|---|---|
| 歩数変換ツールの使い方 | `docs/apple-health-step-export.md` |
| 歩数インポート API | `src/app/api/step-import/route.ts` |
| 空腹時間算出ロジック | `src/lib/utils/calendarUtils.ts` (`calcFastingHours`) |
| 空腹時間・推定睡眠時間の表示コンポーネント | `src/components/dashboard/RecentLogsTable.tsx`, `RecentLogsCards.tsx` |
| 睡眠時間の保存基盤 | `src/app/actions/saveSleepSession.ts`、DB トリガー: `supabase/migrations/20260408000000_create_sleep_sessions.sql` |
| 睡眠時間のUI入力ユーティリティ | `src/lib/utils/sleepSession.ts` (`buildSleepSessionDatetimes`, `calcSleepDurationHours`) |
| 睡眠モデル仕様書 | `docs/sleep-sessions-model-spec.md` |
| condition 系特徴量定義 | `ml-pipeline/feature_registry.py` |
| 段階投入・運用方針 | `docs/project-status.md` |
