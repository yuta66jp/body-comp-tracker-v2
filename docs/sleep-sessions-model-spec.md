# sleep_sessions モデル仕様書

> **現在の扱い（#710 以降）**
> この仕様書は過去の `sleep_sessions` 移行設計の履歴資料であり、現行スキーマではない。
> #710 で `sleep_sessions`、`daily_logs.sleep_hours`、`daily_logs.step_count`、`daily_logs.last_meal_end_time` は削除済み。
> 現在の歩数・睡眠系データは `google_health_daily_metrics` を source of truth とする。現行方針は `docs/step-count-and-fasting-hours.md` を参照する。

> Issue: #514 (親: #513)  
> ステータス: 仕様確定  
> 後続: #515 (DB/保存基盤) / #516 (UI/UX) / #517 (表示投影) / #518 (docs更新)

---

## 0. この仕様書の目的

`sleep_sessions` テーブルを新設し、睡眠記録の source of truth を
`daily_logs.bed_time / sleep_hours` から `sleep_sessions` へ移行するための
仕様を確定する。

後続の #515〜#518 が「迷わず実装できる」レベルまで粒度を整理する。

---

## 1. 現状モデルの問題点

### 1-1. TIME 型による日付曖昧性

現在の `daily_logs.bed_time` は `TIME` 型（日付なし）で保存されている。

```
daily_logs:
  log_date     DATE   PK  -- 起床日
  bed_time     TIME       -- 就寝時刻（HH:MM のみ）
  weigh_in_time TIME      -- 体重測定時刻（HH:MM のみ）
  sleep_hours  REAL       -- 導出済み推定睡眠時間
```

これにより以下の問題が発生する。

| 問題 | 具体例 |
|---|---|
| 日付が不明 | `bed_time=23:30` が「前日夜」か「当日深夜」か DB 上で区別不能 |
| 推論コードが複雑 | `deriveSleepSavePlan()` が「どの log_date に保存するか」を動的に判断する必要がある |
| Apple Health インポート不可 | 秒・タイムゾーン付きの実際の就寝日時を保存する場所がない |
| nap 対応不可 | 日次 PK のため1日に複数レコードを持てない |
| bed_time の意味が二重 | 「同日深夜就寝」と「前日夜就寝」の両方が `bed_time > weigh_in_time` パターンに見えてしまう |

### 1-2. 推論ロジックの限界

`saveDailyLog.ts` の `deriveSleepSavePlan()` は、
`bed_time > weigh_in_time` であれば「前日夜就寝 → 翌日（起床日）レコードに保存」
と判断する。

しかしこのヒューリスティックは、以下のケースで意図と異なる挙動を起こしうる。

- 深夜 23:00 に就寝したが、まだ起床日（翌日）のログが存在しない
  → `new_log_requires_weight` エラー（#512 で修正済みだが根本解決ではない）
- ユーザーが「今日の log_date = 2026-04-08」で就寝時刻 23:30 を入力したとき、
  それが「4/7夜の睡眠（起床日 4/8）」の話なのか「4/8夜の睡眠（起床日 4/9）」の話なのかを
  UIが明示しない

### 1-3. source of truth の分散

- 睡眠時間の source of truth が `daily_logs` に埋め込まれている
- 将来的に外部インポート（Apple Health）で sleep datetime が取れても、
  現在の TIME 型スキーマには格納できない
- `sleep_hours` は導出値なのに `daily_logs` カラムとして永続化されており、
  再計算・再集計の単位が「日」に固定されている

---

## 2. 採用する sleep_sessions のレコード定義

### 基本定義

**1 レコード = 1回の連続した睡眠セッション（就寝から起床まで）**

初期実装では「夜間主睡眠のみ」を対象とする。

- nap（昼寝）・分割睡眠は将来拡張として定義のみ備え、初期実装では除外する
- wake_date ごとに主睡眠は 1 件のみとする（UNIQUE 制約で保証）
- 外部連携（Apple Health）は source カラムで区別できる設計にするが、
  インポート機能の実装は初期スコープ外とする

### セッション日 = 起床日（wake_date）

セッションの「どの日の記録か」は **起床日（wake_date）** を canonical とする。
これは現在の「起床日基準（#507）」と同じ思想を継承する。

```
wake_date = DATE(wake_at AT TIME ZONE 'Asia/Tokyo')
```

`wake_date` は `daily_logs.log_date` と JOIN するための結合キー。
「就寝日」「セッション日」ではなく「起床日」を使う理由:
- `weight` / `weigh_in_time` / `fasting_hours` など他のフィールドはすべて「起床・測定した日」に属する
- ユーザーの感覚でも「7/8 に何時間寝たか」は「7/8 の朝に起きた睡眠」のことを指す

---

## 3. 推奨カラム構成

```sql
CREATE TABLE sleep_sessions (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  wake_date    DATE         NOT NULL,         -- 起床日（daily_logs.log_date に対応）
  bed_at       TIMESTAMPTZ  NOT NULL,         -- 就寝日時（JST で保存。例: 2026-04-07 23:30+09）
  wake_at      TIMESTAMPTZ  NOT NULL,         -- 起床日時（JST で保存。例: 2026-04-08 07:00+09）
  source       TEXT         NOT NULL          -- 入力元: 'manual' | 'apple_health'
                            DEFAULT 'manual'
                            CHECK (source IN ('manual', 'apple_health')),
  note         TEXT,                          -- 任意メモ
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  -- 起床日ごとに手動入力は 1 件のみ（初期制約）
  CONSTRAINT uq_sleep_sessions_wake_date_manual
    UNIQUE (wake_date)
    -- 将来の nap 対応時は UNIQUE を外し session_type ('main'|'nap') を追加する
);

COMMENT ON TABLE sleep_sessions IS '睡眠セッション。1行 = 1回の就寝〜起床。起床日(wake_date)で daily_logs と JOIN する。';
COMMENT ON COLUMN sleep_sessions.wake_date IS '起床日(JST DATE)。daily_logs.log_date と同値。PK 代理に使う結合キー。';
COMMENT ON COLUMN sleep_sessions.bed_at    IS '就寝日時(TIMESTAMPTZ)。タイムゾーン付きで保存し UTC に変換される。';
COMMENT ON COLUMN sleep_sessions.wake_at   IS '起床日時(TIMESTAMPTZ)。DATE(wake_at AT TIME ZONE Asia/Tokyo) = wake_date を満たすこと。';
COMMENT ON COLUMN sleep_sessions.source    IS '入力元。manual=MealLogger手動入力, apple_health=外部インポート。';
```

### `duration_hours` を持たない理由

- `wake_at - bed_at` で常に正確に算出できる
- 保存した導出値が `bed_at` / `wake_at` と乖離するリスクを避ける
- 表示・集計は `EXTRACT(EPOCH FROM (wake_at - bed_at)) / 3600` で行う
- `daily_logs.sleep_hours` への投影は ML バッチ（`enrich.py`）または保存トリガーで行う（後述）

### `wake_date` を明示カラムにする理由

- `DATE(wake_at AT TIME ZONE 'Asia/Tokyo')` を毎回計算するより JOIN が速い
- 挿入時に検証（`wake_date = DATE(wake_at AT TIME ZONE 'Asia/Tokyo')`）すべきで、
  この制約を DB に持たせると明示性が上がる
- 将来的に「起床日を手動上書きしたい」ケースに対応できる（今は非目標）

### 持たないカラム（初期スコープ外）

| カラム候補 | 理由 |
|---|---|
| `session_type` (main/nap) | nap 対応は将来拡張。UNIQUE 制約と矛盾する |
| `quality_score` | 主観評価は入力負担が高い。データ蓄積後に検討 |
| `disruption_count` | 中途覚醒カウントも将来拡張 |
| `heart_rate_avg` | Apple Health の詳細データ連携は将来拡張 |

---

## 4. canonical ケースごとの扱い

すべて wake_date = **2026-04-08** のケース。

| ケース | 就寝 | 起床 | bed_at | wake_at | wake_date | sleep_hours |
|---|---|---|---|---|---|---|
| 前日夜就寝 | 04/07 23:30 | 04/08 07:00 | `2026-04-07 23:30:00+09` | `2026-04-08 07:00:00+09` | `2026-04-08` | 7.5h |
| 当日深夜就寝 | 04/08 01:00 | 04/08 08:00 | `2026-04-08 01:00:00+09` | `2026-04-08 08:00:00+09` | `2026-04-08` | 7.0h |
| 早朝就寝 | 04/08 04:00 | 04/08 10:00 | `2026-04-08 04:00:00+09` | `2026-04-08 10:00:00+09` | `2026-04-08` | 6.0h |
| 当日夜就寝（翌日分） | 04/08 23:00 | 04/09 08:00 | `2026-04-08 23:00:00+09` | `2026-04-09 08:00:00+09` | **2026-04-09** | 9.0h |

### 重要: 4番目のケース（当日夜 23:00 就寝）について

現在のモデルでは「4/8 のログに就寝時刻 23:00 を入力 → 翌日レコードに shift」という
複雑なヒューリスティックが必要だった（`deriveSleepSavePlan`）。

sleep_sessions モデルでは:
- ユーザーが 4/9 の朝に MealLogger で「起床日=4/9」のセッションを登録する
- bed_at=`2026-04-08T23:00+09`, wake_at=`2026-04-09T08:00+09`, wake_date=`2026-04-09`
- **4/8 のログに今夜の就寝時刻を入力する UI はなくなる**（これが正しい設計）

→ ユーザーは「今日の朝に起きた睡眠」を記録する。未来の就寝は記録しない。

### `bed_at` の日付をどう決めるか（UI インタラクション）

ユーザーは MealLogger で `wake_date`（= log_date = 起床した日）を選択した状態で、
就寝時刻（HH:MM）と起床時刻（HH:MM）を入力する。

```
床_at の date を決めるルール:
  - bed_time_str (HH:MM) が wake_time_str (HH:MM) より後 → bed_date = wake_date - 1日
  - bed_time_str (HH:MM) が wake_time_str (HH:MM) 以前  → bed_date = wake_date
```

例:
- wake_date=04/08, bed_time=23:30, wake_time=07:00 → 23:30 > 07:00 → bed_date=04/07
- wake_date=04/08, bed_time=01:00, wake_time=08:00 → 01:00 < 08:00 → bed_date=04/08
- wake_date=04/08, bed_time=04:00, wake_time=10:00 → 04:00 < 10:00 → bed_date=04/08

このロジックは現在の `deriveSleepHours` の「日またぎ補正」と同じ判断基準だが、
結果として TIMESTAMPTZ に変換して保存することで曖昧性が消える。

---

## 5. daily_logs との責務分離

### 責務分離表

| 項目 | sleep_sessions | daily_logs |
|---|---|---|
| 就寝日時 (bed_at) | ✅ source of truth | ❌ 廃止済み (#529 で bed_time 削除) |
| 起床日時 (wake_at) | ✅ source of truth | ❌ 不要 (weigh_in_time は空腹時間算出専用に残す) |
| 起床日 (wake_date) | ✅ PK代理・結合キー | ✅ log_date として継続 |
| 推定睡眠時間 | ✅ wake_at - bed_at で計算 | ✅ sleep_hours を projection 値として保持 |
| 入力元区別 | ✅ source カラム | ❌ 不要 |
| 体重 / 栄養 / 特殊日 | ❌ 不要 | ✅ 既存通り |
| 空腹時間算出 | ❌ 不要 | ✅ last_meal_end_time + weigh_in_time で算出 |

### `daily_logs.sleep_hours` の扱い

- **移行期**: `daily_logs.sleep_hours` は引き続き保持し、以下のいずれかで更新する
  - (推奨) sleep_sessions の INSERT/UPDATE 時に DB トリガーで `daily_logs.sleep_hours` を更新
  - または enrich.py（ML バッチ）が sleep_sessions を読んで daily_logs.sleep_hours を更新
- **最終形**: 表示・分析が sleep_sessions を直接読むようになれば daily_logs.sleep_hours は廃止可能
  - ただし enrich.py / analytics が daily_logs を前提にしているため、当面は保持する

### `daily_logs.bed_time` の扱い

- 移行期は残存させるが、新規保存は sleep_sessions を使う
- 後続 #515〜#517 の実装完了後に廃止 migration を別途作成する（#518 で扱う）
- 廃止前は「読み取り専用・過去データ参照用」として扱う

### `daily_logs.weigh_in_time` の扱い

- **空腹時間算出専用として継続**
- sleep_sessions の wake_at とは独立した値として扱う
- ユーザーが「起床時刻」と「体重測定時刻」を別々に記録できる余地を残す
- 将来的に sleep_sessions.wake_at と統合するかは別途検討

---

## 6. UI/UX 方針

### 基本原則

**「起床した日（= 今日）の前の睡眠を記録する」という UI にする。**

- ユーザーは起床後（= 朝）に MealLogger を開く
- log_date（= 今日 = 起床日）で、「今朝起きた睡眠セッション」を記録する
- 「昨夜何時に寝て、今朝何時に起きたか」という自然な言語に対応したラベルにする

### 入力フォーム設計方針

```
就寝時刻: [HH:MM] ← 昨夜〜今朝にかけての就寝時刻
起床時刻: [HH:MM] ← 自動で weigh_in_time と共有するか、独立するかを #516 で決定
```

- `weigh_in_time` は空腹時間算出に使っており意味が若干異なるため、
  **sleep_sessions の wake_at と weigh_in_time は独立したフィールドとして扱う**
  - ただし「体重測定時刻 ≒ 起床時刻」なので、同じ時刻を入力する運用になる可能性が高い
  - UI で共有するかどうか（「体重測定時刻を起床時刻として使用する」チェックボックス等）は #516 で検討
- 就寝時刻のラベル: `就寝時刻`（現在と同じ）
- 起床時刻のラベル: `起床時刻`（`weigh_in_time` ではなく sleep session の終了時刻として明示）

### date-crossing の非表示化

現在 MealLogger に表示されている補助テキスト:
> 「この日の起床前に始まった睡眠の就寝時刻です。前夜就寝 / 当日深夜就寝 / 早朝就寝を同じ起床日レコードにそろえます」

→ sleep_sessions では入力された時刻から自動的に `bed_at` の日付を決定するため、
  このような補助説明は不要になる（内部実装に言及しない UI にする）。

### 「未来の就寝」は記録しない

- MealLogger は「今日の朝に起きた睡眠（過去の出来事）」を記録するもの
- 「今夜の就寝時刻」を入力する欄は持たない
- → 現在の「当日夜 23:00 就寝 → 翌日レコードに shift」問題は UI 設計の変更で解決する

### MealLogger への統合 vs 独立入力

- 初期実装は MealLogger 内の「コンディション」セクションに含める（現在の場所）
- 将来、睡眠専用の入力フローを設けるかどうかは別途検討

---

## 7. 将来拡張の前提整理

### 初期実装でサポートする範囲

| 機能 | 初期 | 将来 |
|---|---|---|
| 夜間主睡眠（1日1件） | ✅ | — |
| 手動入力（MealLogger） | ✅ | — |
| nap（昼寝）記録 | ❌ | ✅ |
| 分割睡眠（複数セッション） | ❌ | ✅ |
| Apple Health インポート | ❌（schema 対応済み） | ✅ |
| 睡眠品質スコア | ❌ | ✅ |
| 中途覚醒カウント | ❌ | ✅ |
| 睡眠規則性分析 | ❌ | ✅ |
| 睡眠と体重変化の相関分析 | ❌ | ✅ |
| feature_registry への投入 | ❌ | ✅（データ蓄積後） |

### nap / 分割睡眠の将来拡張に備えた設計判断

- `UNIQUE (wake_date)` 制約は、将来の nap 対応時に外す
- 代わりに `session_type TEXT CHECK (session_type IN ('main', 'nap'))` カラムを追加し
  `UNIQUE (wake_date, session_type)` にする想定
- 初期の `source` カラムはこの変更を見越した設計

### Apple Health インポートへの備え

- `source = 'apple_health'` で既存の手動入力と区別できる
- Apple Health は秒単位 + UTC タイムゾーンで記録するため、TIMESTAMPTZ が必須
- インポートロジックは `step_count` と同様の設定画面 CSV/JSON インポートを想定
- ただし初期実装スコープ外

---

## 8. 非目標 / 保留事項

### 非目標（今後も対象外）

- 睡眠計測・睡眠トラッキング（このアプリは「推定値としての睡眠記録」のみ扱う）
- リアルタイム同期・自動取得（外部デバイスとのライブ連携）
- 複数ユーザー対応（現行は single-user hardening。Supabase Auth + RLS は導入済みだが、チーム共有 UI や複合 UNIQUE への移行は対象外）
- 睡眠スコアリング・評価機能

### 保留事項（#515〜#518 で決定する）

| 項目 | 保留理由 | 決定者 |
|---|---|---|
| `weigh_in_time` と `wake_at` の UI 共有 | 2 フィールドを 1 入力欄にするかどうか UX 要確認 | #516 |
| DB トリガー vs enrich.py での `sleep_hours` 更新 | バッチ設計依存 | #515 |
| `daily_logs.bed_time` の廃止タイミング | ~~migration 互換性・移行期の長さ~~ | **#529 で廃止済み** |
| `sleep_sessions` の RLS ポリシー | **#606 で確定済み**。anon は不可、authenticated は `user_id = auth.uid()` の owner scoped SELECT / INSERT / UPDATE / DELETE | #606 |
| sleep_sessions の wake_date UNIQUE 制約の将来外し判断 | nap 対応のタイミングで決定 | 将来 Issue |

---

## 9. 後続子 Issue（#515〜#518）への申し送り

### #515: DB / 保存基盤

- `sleep_sessions` テーブルを上記スキーマで作成する
- RLS ポリシー: anon には許可しない。authenticated session で `user_id = auth.uid()` の自分の行だけ SELECT / INSERT / UPDATE / DELETE を許可する
- `save_sleep_session` RPC または supabase-js 直接 upsert を実装する
  - upsert key: `wake_date`（主睡眠 1件制約を維持）
- `daily_logs.sleep_hours` を更新する手段を決定する（トリガー推奨）
- `daily_logs.bed_time` カラムおよび `saveDailyLog.ts` の `deriveSleepSavePlan` / sleep shift ロジックは #529 で削除済み
  - sleep 系フィールドは `sleep_sessions` テーブルへ保存するルートに切り替え済み
  - `SaveDailyLogInput` から `bed_time` を削除済み

### #516: UI/UX

- MealLogger の「コンディション」セクションで `sleep_sessions` を upsert する UI を実装
- 入力フィールド: 就寝時刻（HH:MM）・起床時刻（HH:MM）
- `bed_at` の日付決定ロジック（bed_time > wake_time → 前日）をクライアント側で実装
- `weigh_in_time` との統合 UI を検討（共有 or 独立）
- hydrate: 既存の `sleep_sessions` レコードから `bed_at` / `wake_at` を読んで HH:MM で表示
- clear: セッションを削除（DELETE）する操作として実装

### #517: 表示投影

- ダッシュボード「直近ログ」テーブル / カードリスト: `sleep_hours` 表示は継続
  （`daily_logs.sleep_hours` を引き続き参照 or `sleep_sessions` を JOIN で取得）
- 表示元の切り替えタイミングを決定する
- 将来の睡眠専用チャートは別 Issue

### #518: docs / CLAUDE.md 更新

- `CLAUDE.md` の sleep 関連記述を `sleep_sessions` ベースに書き換える
- `docs/step-count-and-fasting-hours.md` の「3. 推定睡眠時間」セクションを更新
- `bed_time` の廃止方針を明記する
- この仕様書（`docs/sleep-sessions-model-spec.md`）自体を更新・確定する

---

## 10. 仕様確定サマリー

| 決定事項 | 内容 |
|---|---|
| 1セッションの定義 | 1回の就寝〜起床 = 1レコード。初期は夜間主睡眠のみ。 |
| セッション日 | 起床日（wake_date）を canonical とする。daily_logs.log_date と一致。 |
| 日付型 | bed_at / wake_at は TIMESTAMPTZ（日付+時刻+タイムゾーン）。TIME 型は廃止方向。 |
| source of truth | sleep_sessions が睡眠の source of truth。daily_logs.sleep_hours は projection 値として当面保持。 |
| daily_logs.bed_time | **#529 で廃止済み**（migration: `20260411000000_drop_bed_time_from_daily_logs.sql`）。 |
| daily_logs.weigh_in_time | 空腹時間算出専用として継続。sleep_sessions とは独立。 |
| UNIQUE 制約 | wake_date に UNIQUE（主睡眠 1件制約）。将来の nap 対応時に外す。 |
| bed_at 日付推論ルール | bed_time > wake_time → bed_date = wake_date - 1日。それ以外 → bed_date = wake_date。 |
| 「今夜の就寝」は記録しない | UI は「今朝起きた睡眠」を記録する設計。未来の就寝入力欄は持たない。 |
| Apple Health | source カラムで区別可能な schema にする。インポート実装は将来。 |
| nap 対応 | schema は拡張可能に設計。初期は非対応（UNIQUE 制約で排除）。 |

---

_作成: 2026-04-08 / spec/issue-514-sleep-sessions-model_
