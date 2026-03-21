# daily_logs read API 利用箇所棚卸し

> Issue: #164
> 作成日: 2026-03-21
> 目的: 後続 Issue (#165 #166 #167) が迷わず着手できる粒度での設計整理

---

## 1. 現行 read API 一覧

| 関数名 | 取得テーブル | SELECT 列 | 絞り込み | sort | 戻り値型 | fallback 方針 |
|---|---|---|---|---|---|---|
| `fetchDailyLogs()` | `daily_logs` | `*` (全列) | なし | log_date ASC | `QueryResult<DailyLog[]>` | error banner 表示、空配列フォールバック |
| `fetchWeightLogs()` | `daily_logs` | log_date, weight | weight NOT NULL | log_date ASC | `Pick<DailyLog, "log_date"\|"weight">[]` | 空配列（ベストエフォート） |
| `fetchDailyLogsForSettings()` | `daily_logs` | log_date, weight, calories | なし | log_date ASC | `QueryResult<DataQualityLog[]>` | error banner 表示、空配列フォールバック |
| `fetchCareerLogs()` | `career_logs` | `*` (全列) | なし | log_date ASC | `QueryResult<CareerLog[]>` | error banner 表示、空配列フォールバック |
| `fetchCareerLogsForDashboard()` | `career_logs` | log_date, season, target_date | なし | log_date ASC | `Pick<CareerLog, ...>[]` | 空配列（ベストエフォート） |
| `fetchPredictions()` | `predictions` | `*` (全列) | なし | ds ASC | `Prediction[]` | 空配列（ベストエフォート） |

---

## 2. 画面別 daily_logs read 要件

### 2-1. Dashboard (`src/app/page.tsx`)

**使用クエリ:** `fetchDailyLogs()` (全列・全期間)

**実際に参照する列:**

| 列 | 参照箇所 | 備考 |
|---|---|---|
| `log_date` | calcReadiness, calcWeeklyReview, calcDataQuality, ForecastChart, RecentLogsTable, MonthlyCalendar, monthlyGoalVisualization, buildMonthStats | 日付インデックスとして全処理で使用 |
| `weight` | calcReadiness (7d/14d 平均・トレンド), calcWeeklyReview, buildMonthStats, monthlyGoalVisualization, ForecastChart, MonthlyCalendar | null 許容 |
| `calories` | calcWeeklyReview (栄養収支), buildMonthStats, calcDataQuality, RecentLogsTable | null 許容 |
| `protein` | calcWeeklyReview (PFC 比率), buildMonthStats | null 許容 |
| `fat` | buildMonthStats (月間平均算出用・将来拡張) | 現状 MonthStats に avgFat なし、ただし calcWeeklyReview経由間接参照 |
| `carbs` | calcWeeklyReview (PFC 計算) | null 許容 |
| `sleep_hours` | RecentLogsTable (コンディション表示) | null 許容 |
| `training_type` | RecentLogsTable, calendarUtils (タグ表示) | null 許容 |
| `work_mode` | RecentLogsTable, calendarUtils (タグ表示) | null 許容 |
| `had_bowel_movement` | RecentLogsTable, calendarUtils (タグ表示) | null 許容 |
| `updated_at` | stale 判定 (`MAX(updated_at)` → fetchEnrichedLogs に渡す) | **全ログ分が必要** |

**必要期間:** 全期間（理由: calcReadiness のトレンド計算・monthlyGoalVisualization の月次実績・ForecastChart の全体俯瞰）

**sort:** log_date ASC（現状のまま）

**error fallback:** QueryResult → error banner + 空配列で graceful degradation。ページはブロックしない。

---

### 2-2. Macro (`src/app/macro/page.tsx`)

**使用クエリ:** `fetchDailyLogs()` (全列・全期間)

**実際に参照する列:**

| 列 | 参照箇所 | 備考 |
|---|---|---|
| `log_date` | calcMacroKpi (slice 基準), calcDailyMacro (日付ラベル) | |
| `weight` | calcMacroKpi (直近7/14/30日 平均体重) | null 許容 |
| `calories` | calcMacroKpi, calcDailyMacro | null 許容 |
| `protein` | calcMacroKpi, calcDailyMacro | null 許容 |
| `fat` | calcMacroKpi, calcDailyMacro | null 許容 |
| `carbs` | calcMacroKpi, calcDailyMacro | null 許容 |
| `updated_at` | stale 判定 (`MAX(updated_at)` → fetchFactorAnalysis に渡す) | **全ログ分が必要** |

**必要期間（表示 window）:**
- **グラフ・テーブル: 直近 60 日固定**（`calcDailyMacro(logs, 60)` で slice）
- KPI 計算: 直近 7 / 14 / 30 日（`slice(-7)` / `slice(-14,-7)` / `slice(-30)`）
- stale 判定: 全ログの MAX(updated_at)

**sort:** log_date ASC

**error fallback:** QueryResult → ページ全体を error 表示（Macro は主データのため strong requirement）

> **UI 表示期間固定要件（#164 確定）**
> Macro の PFC スタック・日次テーブルは **直近 60 日表示** を維持する。
> クエリを 60 日に絞っても KPI 計算（直近 30 日以内）はカバーされるが、
> `updated_at` の stale 判定で全ログ走査が必要なため、クエリ期間短縮は別途検討が必要。

---

### 2-3. TDEE (`src/app/tdee/page.tsx`)

**使用クエリ:** `fetchDailyLogs()` (全列・全期間)

**実際に参照する列:**

| 列 | 参照箇所 | 備考 |
|---|---|---|
| `log_date` | chartData (fallback 時の軸), rawCaloriesMap, tableData, last7/prev7 | |
| `weight` | latestWeight (最新値取得), last7/prev7 平均 (KPI 計算) | null 許容 |
| `calories` | rawCaloriesMap (enriched fallback), last7 平均 (KPI 計算), tableData | null 許容 |
| `updated_at` | stale 判定 (`MAX(updated_at)` → fetchEnrichedLogs に渡す) | **全ログ分が必要** |

**必要期間（表示 window）:**
- **グラフ: enriched_logs を主軸とする「約 6 か月以上の全履歴」** — rawLogs はグラフ fallback 専用
- **KPI 計算: 直近 14 行** (last7 + prev7, `sortedRaw.slice(-14)`)
- **テーブル: 直近 14 行** (`sortedRaw.slice(-14)`)
- **stale 判定: 全ログの MAX(updated_at)**
- **グラフ fallback: 全ログ**（enriched 未計算時のみ）

**sort:** log_date ASC（page 内で `.sort()` で再ソートしているが fetchDailyLogs 自体は ASC 取得）

**error fallback:** QueryResult → error banner 表示。ページはブロックしない。enriched が使えれば主要グラフは表示継続。

> **UI 表示期間固定要件（#164 確定）**
> TDEE グラフの表示 window は enriched_logs の日付範囲に依存する（約 6 か月以上）。
> rawLogs の期間を短縮してもグラフ影響は小さいが、
> enriched 未計算時の fallback グラフが短期表示になるというトレードオフが生じる。
> KPI 計算と表示 window は分離可能（後述）。

---

### 2-4. History (`src/app/history/page.tsx`)

**使用クエリ:** `fetchWeightLogs()` (log_date + weight のみ)

**実際に参照する列:** log_date, weight

**必要期間:** 全期間（大会日からの days-out グラフ・シーズン比較で全履歴が必要）

**sort:** log_date ASC

**error fallback:** ベストエフォート（空配列 → currentLogs が空になり currentAsCareer も空。グラフは career_logs のみで表示）

**備考:** `fetchCareerLogs()` が主データ（QueryResult）。`fetchWeightLogs()` は現在シーズンの日次体重を career_logs 形式に変換するための補助クエリ。ページ主機能のブロックは不要。

---

### 2-5. Settings (`src/app/settings/page.tsx`)

**使用クエリ:** `fetchDailyLogsForSettings()` (log_date + weight + calories のみ)

**実際に参照する列:** log_date, weight, calories

**必要期間:** 全期間（DataQuality の28日・7日窓計算、currentWeight 取得 = 最新ログ）

**sort:** log_date ASC

**error fallback:** QueryResult → error banner 表示。DataQualityPanel が空データで表示される。

---

## 3. 表示 window と計算 window の分離可能性

| 画面 | 表示 window | 計算に必要な実質行数 | 分離可能か |
|---|---|---|---|
| Dashboard | 全期間（月次計画・ForecastChart） | 全期間必須 | 不可（計算も全期間必要） |
| Macro | 直近 60 日 | 直近 30 日（KPI）+ updated_at 全走査 | **条件付き可能** ※1 |
| TDEE | enriched 全期間（グラフ）| 直近 14 行（KPI/テーブル）+ updated_at 全走査 | **分離可能** ※2 |
| History | 全期間 | 全期間必須 | 不可 |
| Settings | 全期間 | 全期間必須（DataQuality 28日窓） | 不可 |

**※1 Macro の分離余地:**
クエリを `ORDER BY log_date DESC LIMIT 60` にすれば表示・KPI を両立できる。
ただし `updated_at` の stale 判定には全ログ走査が必要なため、
stale 判定用に `MAX(updated_at)` を別クエリ（集計クエリ）として分離するか、
Macro ページの stale 判定を廃止・簡略化する必要がある。

**※2 TDEE の分離余地:**
`rawLogs` は以下の目的にしか使われていない:
- KPI/テーブル計算: 直近 14 行で十分
- グラフ fallback: enriched 計算済みなら不要、未計算時のみ全件必要
- stale 判定: MAX(updated_at) = 集計クエリ化で代替可能
- latestWeight: DESC LIMIT 1 で十分

よって TDEE 向けに `fetchRecentDailyLogs(limit: 14)` + 集計クエリ分離が最も効果的。

---

## 4. front 用 read と full read の責務境界

```
【front 用 read（現行の fetchDailyLogs 系）】
  - 目的: UI 表示・フロント計算のためのデータ取得
  - 認証: anon key + RLS
  - 量: 画面に必要な行数に限定すべき（最適化余地あり）
  - 現行の重さ: fetchDailyLogs() は全件・全列 = 個人利用規模では許容範囲

【full read（ML バッチ / enrich.py / analyze.py / predict.py）】
  - 目的: 統計計算・モデル学習・TDEE 推定に必要な全履歴
  - 認証: SUPABASE_SERVICE_ROLE_KEY（GitHub Actions Secrets）
  - 量: 全件必須（移動平均・rolling window 計算に全履歴が必要）
  - フロントは触らない（batch 側のみ）
```

**責務境界の原則:**
- フロントが全件 full read をするのは Dashboard のみ正当（月次計画・全期間グラフが必要）
- Macro・TDEE は表示期間に合わせた軽量 read に移行できる設計余地がある
- ML バッチの full read はフロントとは完全に分離されており変更不要

---

## 5. 既存軽量クエリの位置づけ整理

### `fetchWeightLogs()`
- **現在の用途:** History ページ専用（currentAsCareer 変換）
- **取得列:** log_date, weight（最小限）
- **フォールバック:** ベストエフォート（空配列）
- **位置づけ:** History 向け軽量クエリとして正当。他画面に流用しない。

### `fetchDailyLogsForSettings()`
- **現在の用途:** Settings ページ専用（DataQuality 計算 + currentWeight 取得）
- **取得列:** log_date, weight, calories（必要最小限）
- **フォールバック:** QueryResult（DataQuality は主要表示のため error banner あり）
- **位置づけ:** Settings 向け軽量クエリとして正当。他画面に流用しない。

### `fetchDailyLogs()`
- **現在の用途:** Dashboard / Macro / TDEE の共用全件クエリ
- **課題:** Macro / TDEE は全件不要な部分がある（前述）
- **後続方針:** 後続 Issue で画面別軽量クエリへの分離を検討する

---

## 6. 推奨 query 分割方針

後続 Issue での実装方針を以下の通り提案する。

### 優先度 High — Macro / TDEE 軽量化（主担当: #166、関連: #167）

**Macro 向け（主担当: #166）:**

```typescript
// 新規追加候補
fetchMacroDailyLogs(days: number): Promise<QueryResult<Pick<DailyLog, "log_date" | "weight" | "calories" | "protein" | "fat" | "carbs">[]>>
// SELECT log_date, weight, calories, protein, fat, carbs ORDER BY log_date DESC LIMIT {days}
```

Macro ページでは:
- グラフ/テーブル: `fetchMacroDailyLogs(60)` — **60 日固定維持**
- stale 判定: `fetchLatestUpdatedAt()` を共用

**TDEE 向け（主担当: #166、責務分離クエリは #167 で調整）:**

```typescript
// 新規追加候補
fetchRecentDailyLogs(limit: number): Promise<QueryResult<Pick<DailyLog, "log_date" | "weight" | "calories">[]>>
// SELECT log_date, weight, calories ORDER BY log_date DESC LIMIT {limit}

fetchLatestUpdatedAt(): Promise<string | null>
// SELECT MAX(updated_at) FROM daily_logs  ← Macro / TDEE 共用の stale 判定クエリ
// 主担当: #166（Macro で先行実装）、#167 で TDEE に流用
```

TDEE ページでは:
- KPI/テーブル: `fetchRecentDailyLogs(14)`
- stale 判定: `fetchLatestUpdatedAt()`（#166 で追加したものを共用）
- グラフ: enriched_logs 主軸（rawLogs fallback は表示品質トレードオフを受け入れ）

### 優先度 Low — Dashboard は現状維持（#165 確認後）

Dashboard は全期間・全列が正当な要件のため `fetchDailyLogs()` を継続利用。
個人利用規模で問題が出るまで最適化しない（CLAUDE.md 方針に沿う）。

---

## 7. QueryResult vs ベストエフォートの現状評価

| クエリ | 現状 | 評価 |
|---|---|---|
| `fetchDailyLogs()` | QueryResult | 適切（主データ、エラー時に空描画になると判断困難） |
| `fetchWeightLogs()` | ベストエフォート | 適切（History の補助データ、空でも主機能は成立） |
| `fetchDailyLogsForSettings()` | QueryResult | 適切（DataQuality は主表示、エラー表示が必要） |
| `fetchCareerLogs()` | QueryResult | 適切（History の主データ） |
| `fetchCareerLogsForDashboard()` | ベストエフォート | 適切（シーズンバッジは補助表示） |
| `fetchPredictions()` | ベストエフォート | 適切（ML 未実行時も正常状態として扱う） |

新規追加予定クエリの方針:
- `fetchRecentDailyLogs()` → QueryResult（TDEE/Macro の主データとなるため）
- `fetchLatestUpdatedAt()` → ベストエフォート（null 返却でも stale 判定をスキップするだけ）

---

## 8. UI 表示期間の固定要件（#164 確定事項）

以下は後続 Issue で変更してはならない UI 仕様として確定する:

| 画面 | 表示 window | 根拠 |
|---|---|---|
| Macro グラフ・テーブル | **直近 60 日固定** | `calcDailyMacro(logs, 60)` の既存仕様 |
| TDEE グラフ | **enriched_logs の全期間（約 6 か月以上）** | 長期代謝変化の可視化が主目的 |
| TDEE テーブル | **直近 14 日** | `sortedRaw.slice(-14)` の既存仕様 |
| Dashboard ForecastChart | 全期間 | 予測との比較に全履歴が必要 |

**TDEE 固定の理由:**
TDEE は「長期の代謝変化を見る」画面。表示 window を短縮すると代謝トレンドが見えなくなる。
クエリの取得最適化と表示 window 短縮を混同しないこと。

---

## 9. 後続 Issue への引き継ぎメモ

### #165 — Dashboard 対応

- `fetchDailyLogs()` の継続利用を確認（全期間・全列が必要）
- `updated_at` を使った stale 判定パターンは現状のまま維持
- `fetchLatestUpdatedAt()` は #166 で先行実装されるため、Dashboard への適用は #165 で判断

### #166 — Macro / TDEE read 整理（主担当）

**Macro:**
- `fetchMacroDailyLogs(60)` を新規追加（SELECT 6列・DESC LIMIT 60）
- `calcMacroKpi` に渡す logs が `slice(-60)` で KPI 計算（最大 30 日）に足りることを確認済み
- 60 日の固定要件を崩さないこと

**共通（#166 で先行実装、#167 で流用）:**
- `fetchLatestUpdatedAt()` を新規追加（`SELECT MAX(updated_at) FROM daily_logs`）
- Macro の stale 判定を `fetchLatestUpdatedAt()` に分離
- TDEE の stale 判定も同クエリを流用（#167 で実装）

### #167 — TDEE 軽量化（#166 の fetchLatestUpdatedAt を流用）

- `fetchRecentDailyLogs(14)` を新規追加（SELECT log_date, weight, calories・DESC LIMIT 14）
- stale 判定は #166 で実装済みの `fetchLatestUpdatedAt()` を共用
- グラフ fallback（enriched 未計算時）の取り扱いを決める：
  - Option A: fallback グラフを廃止（enriched のみでグラフ表示）
  - Option B: fallback 用に別途 `fetchDailyLogs()` を維持
  - **推奨: Option A**（enriched が unavailable 時は「バッチ未実行」バナーで代替）
- latestWeight は `fetchRecentDailyLogs(1)` + weight NOT NULL filter で代替可能

---

## 10. スコープ外として残した論点

- `updated_at` カラムが `daily_logs` スキーマに存在するかの `supabase gen types` 確認
  → types.ts の再生成が必要（CLAUDE.md の残課題として既記載）
- Macro / TDEE のクエリ分割"実装"（#166 #167 で扱う）
- `fetchDailyLogs()` のページネーション・cursor-based pagination（個人利用規模で不要）
- revalidate 設定と query 責務の整合確認（Dashboard は revalidate なし、Macro/TDEE は 3600 秒）
  → 後続 Issue の実装時に各ページで確認する
- Settings の `revalidate = 0` が適切かの再評価（現状維持で問題なし）
