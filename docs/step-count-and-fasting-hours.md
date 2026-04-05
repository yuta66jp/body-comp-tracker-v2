# 歩数・空腹時間の記録と今後の方針

本ドキュメントは、#435（空腹時間）・#443/#444（歩数）で追加した 2 つの観測フィールドについて、
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

現時点では step_count の専用表示 UI はない。
設定画面のインポート後に保存されたことを確認するには、CSV エクスポートで `step_count` 列を確認する。

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
| ダッシュボード「カレンダー」タブ | `CalendarDayData.fasting_hours` として保持（セル内には未表示） | — |

### 現時点の非目標

- 空腹時間の推移グラフや統計サマリーの表示 UI
- 空腹時間と体重変化の相関分析
- 目標空腹時間の設定や達成判定
- 予測モデルへの特徴量投入
- SHAP による因子説明

---

## 3. 今後の分析利用方針

### 基本方針: まずデータを蓄積する

歩数・空腹時間ともに、まず一定期間の継続記録を優先する。
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

歩数（`step_count`）と空腹時間（`fasting_hours` として算出）は、これらの後続候補として検討対象になりうる。

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
- どちらも欠損があっても分析全体を壊さない設計にする（欠損は欠損として扱う）
- 未入力は `NULL` として扱う。推定値や自動補完を安易に埋めない

---

## 関連ドキュメント・ファイル

| 対象 | 場所 |
|---|---|
| 歩数変換ツールの使い方 | `docs/apple-health-step-export.md` |
| 歩数インポート API | `src/app/api/step-import/route.ts` |
| 空腹時間算出ロジック | `src/lib/utils/calendarUtils.ts` (`calcFastingHours`) |
| 空腹時間の表示コンポーネント | `src/components/dashboard/RecentLogsTable.tsx`, `RecentLogsCards.tsx` |
| condition 系特徴量定義 | `ml-pipeline/feature_registry.py` |
| 段階投入・運用方針 | `docs/project-status.md` |
