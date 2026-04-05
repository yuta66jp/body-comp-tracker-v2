# 長期イベント区間を考慮した予測評価・予測生成ポリシー設計

> 作成日: 2026-04-05
> 対象 Issue: #479（親テーマ整理）
> 関連 Issue: #480（評価ポリシー追加・子 Issue）

---

## 1. このドキュメントの目的

現行の予測評価・予測生成パイプラインにおける「イベント除外」の仕様を整理し、
長期イベント区間を考慮した評価ポリシーを段階的に設計・検証していくための
親テーマドキュメントとして位置づける。

実装の先行より「何を・なぜ・どの順で変えるか」の論点整理を優先する。
各実装タスクは子 Issue に分割して進める。

---

## 2. 現状実装の整理

### 2-1. DB に存在するイベントフラグ

`daily_logs` テーブルには以下の 4 つのイベントフラグが存在する。

| カラム名 | 型 | 意味 |
|---|---|---|
| `is_cheat_day` | boolean | チートデイ（大幅カロリーオーバー日） |
| `is_travel_day` | boolean | 旅行日（外食・活動量の大幅変化） |
| `is_refeed_day` | boolean | リフィード日（意図的カロリー増加） |
| `is_eating_out` | boolean | 外食日 |

### 2-2. 評価除外に現在使われているフラグ

**`backtest.py` の `build_exclusion_dates()`** が評価除外の実装。
除外対象として扱うのは以下のみ（`is_refeed_day` / `is_eating_out` は対象外）。

```
1. is_cheat_day=True の日 + 後続 recovery_days 日間
2. is_travel_day=True の日 + 後続 recovery_days 日間
3. --event-periods で手動指定したイベント区間 + end 後 recovery_days 日間
```

同じロジックを TypeScript 側でミラーしているのが `backtestExclusion.ts` の `buildExclusionList()`。
Python / TypeScript の2箇所に定義があり、整合が必要（現状は一致している）。

### 2-3. 現在の回復期間仕様

```python
_DEFAULT_RECOVERY_DAYS = 2
```

- **付与の単位**: イベント日ごとに独立して付与する。連続したイベント日が続く場合、
  各日に +2 日の回復期間が設定されるが、区間全体の終了後から N 日というロジックはない。
- **可変設定**: `--recovery-days` CLI 引数で上書き可能（整数、全イベント共通）。
- **挙動の例**:
  - 単日チートデイ（1/28）: 1/28, 1/29, 1/30 が除外
  - 3日連続チートデイ（1/28〜1/30）: 1/28 の回復 +2 と 1/30 の回復 +2 が重なり
    実質 1/28〜2/1 が除外（ただし「区間終了後から」という意識ではなく、日単位の累積）

### 2-4. 現在の評価ポリシー

```python
POLICY_ALL_DAYS = "all_days"                         # 全予測点を評価対象
POLICY_EXCLUDE_FLAGGED_PLUS_RECOVERY = "exclude_flagged_plus_recovery"  # 上記除外後を評価対象
_DEFAULT_EVAL_POLICIES = [POLICY_ALL_DAYS, POLICY_EXCLUDE_FLAGGED_PLUS_RECOVERY]
```

デフォルトで 2 ポリシーを同一 run で並行算出し、`forecast_backtest_metrics` に保存する。
`forecast-accuracy` ページの `BacktestPolicyComparison` コンポーネントが 2 ポリシーの差分を表示する。

### 2-5. NeuralProphet 学習系列の現状

`predict.py` の `fetch_daily_logs()` は以下のみを取得する。

```python
client.table("daily_logs").select("log_date,weight").order("log_date").execute()
```

- `is_cheat_day` / `is_travel_day` は取得していない
- イベント期間の除外なしに全体重データで学習
- 評価除外ロジックと学習データは**現状で完全に独立**している

### 2-6. 現状の除外は「点」の除外

現行の `build_exclusion_dates()` は各フラグ日を独立して処理する（「点」の除外）。
連続するイベント日を「区間」として検出し、区間終了後に一括で回復期間を付与するロジックはない。

```
# 現状のロジックイメージ（点処理）
1/28: is_cheat_day → 1/28, 1/29, 1/30 を除外
1/29: is_cheat_day → 1/29, 1/30, 1/31 を除外
1/30: is_cheat_day → 1/30, 1/31, 2/1 を除外
→ 結果として 1/28〜2/1 が除外されるが「1/30が区間末尾」という意識がない
```

---

## 3. 長期イベント区間に関する用語定義

### 3-1. イベント日（event day）

`is_cheat_day=True` または `is_travel_day=True` が記録された日。
あるいは `--event-periods` で手動指定した期間内の日。

> 現状: `is_refeed_day` / `is_eating_out` はイベント日候補に含まれていない。
> 将来的に追加するかはデータ蓄積後の検討事項とする（本テーマのスコープ外）。

### 3-2. イベント区間（event block）

連続するイベント日の集合。

- 隣接する日（間に非イベント日を挟まない）を1つのブロックとして扱う。
- 1 日のイベント日は「長さ 1 のイベント区間」である。
- 例: 1/28〜2/10 がすべてチートデイ → 長さ14のイベント区間

> **設計余地**: 1日おきなど「疎な連続」を区間と見なすかは、今後の検証で判断する。
> 初期実装では「連続日のみ」を区間とする単純仕様を採用する。

### 3-3. 長期イベント区間（long event block）

長さが閾値以上のイベント区間。

- **初期閾値案**: 5日以上（`long_event_threshold = 5`）
- **根拠**: 1〜2日のチートデイは通常の除外ポリシーで十分対処できる。
  5日以上の連続イベントは「通常生活への復帰と体重安定化」に異なる時間軸が必要であるという仮説。
- **注意**: この閾値は検証前の初期仮説であり、`backtest.py` では定数として実装するが
  CLI 引数（`--long-event-threshold`）で上書き可能にして検証の余地を残す。

### 3-4. 回復期間（recovery period）

イベント区間終了後、体重が通常状態に戻るまでと想定する期間。
この期間も評価から除外する対象とする。

**現状の回復期間モデル（点処理）:**
- イベント日ごとに固定 2 日の回復期間を付与する
- 長期区間末尾の日付という概念がない

**将来の回復期間モデル（区間処理、設計余地）:**
- イベント区間の「終了日の翌日から」N 日を回復期間とする
- N の決め方の案:
  - 固定値: `long_event_recovery_days = 5`（初期検証用）
  - 比例: `min(block_length, MAX_RECOVERY_DAYS)`（区間長に応じた可変）
- 短期イベント（5日未満）の回復期間は現行のまま（`recovery_days=2`）とする

> 初期実装では固定値で検証し、サンプル数への影響を確認してから可変化を判断する。

---

## 4. 評価ポリシーの設計

### 4-1. 比較すべき 3 ポリシー

| ポリシー名 | 説明 | 現状 |
|---|---|---|
| `all_days` | 全予測点を評価対象 | 実装済み |
| `exclude_flagged_plus_recovery` | フラグ日 + 固定回復日を除外 | 実装済み |
| `exclude_long_event_blocks` | 長期イベント区間 + 区間末尾からの回復期間を除外 | **未実装（#480 のスコープ）** |

### 4-2. 3 ポリシー比較で分かること

```
all_days                         → ベースライン精度（イベント影響込み）
exclude_flagged_plus_recovery    → 「点」除外効果
exclude_long_event_blocks        → 「区間」除外の追加寄与

差分 A = exclude_flagged_plus_recovery - all_days   → 点除外の改善量
差分 B = exclude_long_event_blocks - exclude_flagged_plus_recovery
         → 長期区間除外の追加改善量（プラスなら採用価値あり）
```

差分 B が有意なら NeuralProphet 学習系列からの除外を検討する根拠になる。
差分 B が小さければ、学習ロジック変更のコストに見合わない可能性が高い。

### 4-3. 評価ポリシー間の除外対象の重なり

```
all_days ⊃ exclude_flagged_plus_recovery ⊃ exclude_long_event_blocks

（exclude_long_event_blocks は現行除外に加えて長期区間を追加除外するため、
 サンプル数は必ず exclude_flagged_plus_recovery 以下になる）
```

サンプル数の減少が大きすぎる場合は比較の信頼性が落ちる。
各ポリシーのサンプル数 `n` を必ず比較表に含めること。

### 4-4. ポリシー実装の責務分離

| レイヤー | 実装箇所 | 状態 |
|---|---|---|
| 評価ポリシー定義 | `ml-pipeline/backtest.py` | 要追加（#480） |
| 除外日一覧の TS ミラー | `src/lib/utils/backtestExclusion.ts` | 要追加（#480） |
| 評価結果の表示 | `src/components/charts/BacktestPolicyComparison.tsx` | 要更新（#480） |
| 除外対象日の確認表示 | `src/components/charts/BacktestExcludedDates.tsx` | 要更新（#480） |
| NeuralProphet 学習データ | `ml-pipeline/predict.py` | **#480 スコープ外** |
| ダッシュボード AI 予測線 | `src/app/page.tsx` 等 | **#480 スコープ外** |

---

## 5. まず評価から着手すべき理由

1. **仮説検証の前提**: 長期イベント区間除外が精度向上に寄与するかどうか、
   実際のデータで定量確認する前に学習ロジックを変更することは根拠薄弱。
   評価で改善が確認できて初めて学習層への適用判断ができる。

2. **副作用の見積もり**: 除外範囲を広げるとサンプル数が減る。
   サンプル数が少ない状態でのバックテスト結果は信頼性が低くなる。
   評価ポリシー追加なら「除外数・サンプル数・精度」の3要素を同時に確認できる。

3. **学習ロジックは不可逆コストが高い**: `predict.py` を変更して本番学習を変えると、
   変更前後で予測系列が断絶する。評価比較で方針を固めてから実施すべき。

4. **ダッシュボード変更の前提**: AI 予測線の表示方針は、精度評価の結果次第で
   「現行予測を継続」「新ポリシー適用後の予測に切替」のどちらにもなりうる。
   表示変更は評価と学習の両方が決まった後の判断事項。

---

## 6. #480 で扱う範囲

**#480 のスコープ: 評価ポリシー追加と比較可視化**

### Python 側（backtest.py）
- `POLICY_EXCLUDE_LONG_EVENT_BLOCKS = "exclude_long_event_blocks"` の定数追加
- `detect_long_event_blocks(df, threshold=5)` 関数の追加
  - 連続するイベント日を区間として検出する
  - 区間長 >= `threshold` を長期イベント区間と判定する
- `build_exclusion_dates()` を区間処理対応に拡張
  - 長期区間本体 + 区間末尾から `long_event_recovery_days` 日間を除外
  - 初期値: `long_event_recovery_days = 5`（CLI 引数 `--long-event-recovery-days` で可変）
- CLI に `--long-event-threshold` / `--long-event-recovery-days` を追加
- 評価ポリシーに `exclude_long_event_blocks` を追加し、3 ポリシー並行算出

### TypeScript 側（backtestExclusion.ts / UI）
- `buildExclusionList()` の拡張: 長期区間検出ロジックを Python ミラーとして追加
- `BacktestPolicyComparison.tsx`: 3 ポリシーの比較表示に更新
- `BacktestExcludedDates.tsx`: 長期区間判定結果の表示追加

### 確認目標
- 3 ポリシーで MAE / RMSE / Bias / n を比較できる状態を作る
- 長期イベント区間の除外対象日数・除外期間が確認できる
- サンプル数の減少量が許容範囲かを確認できる
- 「採用する価値があるか」の判断材料をそろえる

---

## 7. #480 以降に切る子 Issue の方針

### 子 Issue A: NeuralProphet 学習系列への長期イベント区間除外追加

**前提**: #480 の評価比較で改善効果が確認されること。

- `predict.py` の `fetch_daily_logs()` に `is_cheat_day` / `is_travel_day` を追加取得
- 長期イベント区間の日を学習データから除外して `NeuralProphet.fit()` を呼ぶ
- 除外後の学習データが最低行数を下回る場合の fallback 処理
- GitHub Actions の `ml-daily.yml` での定期実行への反映
- 学習系列変更前後で予測値がどう変わるかを確認する手順の整備

**注意**: 本番学習を変えると予測系列が断絶するため、
変更前に評価での有効性確認と、`predictions` テーブルへの影響を把握しておく。

### 子 Issue B: ダッシュボード AI 予測線の表示見直し

**前提**: 子 Issue A の学習系列変更が完了し、新予測で実績 7 日以上が蓄積されること。

- ForecastChart の予測線の信頼性表示・説明文の見直し
- 長期イベント期間中の予測線の信頼性注記（「イベント期間の影響を含む予測」等）
- 予測線の参照方針をダッシュボード上に明示する UI 改善

**注意**: ダッシュボードの実測グラフからイベント期間を非表示にする変更は本テーマとは別。

### 子 Issue C: 回復期間の可変化（将来課題）

- 区間長に応じた `recovery_days` の動的計算（例: `min(block_length // 2, 10)`）
- A/B 比較でどの回復期間モデルが精度に有利かの検証
- 閾値・回復期間のチューニング実験

**位置づけ**: 子 Issue A の効果確認後、十分なデータが蓄積されてから判断する。
現時点では設計余地として記録しておくのみ。

---

## 8. 設計上の制約と留意点

### 8-1. 閾値・回復期間はいずれも仮説値

| パラメータ | 初期値 | 根拠 | 調整タイミング |
|---|---|---|---|
| `long_event_threshold` | 5 日 | 1〜2日は点除外で十分という仮説 | #480 の評価結果を見て再検討 |
| `long_event_recovery_days` | 5 日 | 長期区間後は現行(2日)より長い回復が必要という仮説 | #480 の評価結果を見て再検討 |
| `recovery_days`（既存） | 2 日 | 現行のまま（短期イベント用） | 別途判断 |

**これらを検証前に確定仕様として断定しないこと。**
`backtest.py` に定数として定義するが CLI 引数で可変にし、将来の調整コストを下げる。

### 8-2. Python と TypeScript の同期が必要

除外ロジックは Python（`backtest.py`）と TypeScript（`backtestExclusion.ts`）の
2 箇所に存在する。片方を変更したら必ず両方を更新すること。
TS 側は `BacktestExcludedDates` での表示用途（実行は Python 側）。

### 8-3. `is_refeed_day` / `is_eating_out` の位置づけ

現状これらのフラグは除外ポリシーに含まれていない。
長期イベント区間の文脈でも、初期実装では `is_cheat_day` / `is_travel_day` のみを対象とする。
追加するかはデータ蓄積後の観察で判断する（本テーマのスコープ外）。

### 8-4. サンプル数の下限

除外対象が増えると `n_predictions` が減少し、バックテスト精度指標の信頼性が落ちる。
現状すでに `all_days` で n=14 と少ない。`exclude_long_event_blocks` でさらに減少する場合、
「評価できる状態か」の判断を含めて #480 の完了条件に組み込むこと。

---

## 9. 関連ファイル一覧

| ファイル | 内容 | #480 での変更 |
|---|---|---|
| `ml-pipeline/backtest.py` | 評価ポリシー・除外ロジック実装 | 要変更 |
| `ml-pipeline/predict.py` | NeuralProphet 学習バッチ | #480 スコープ外 |
| `src/lib/utils/backtestExclusion.ts` | 除外日一覧の TS ミラー | 要変更 |
| `src/components/charts/BacktestPolicyComparison.tsx` | ポリシー比較表示 | 要変更 |
| `src/components/charts/BacktestExcludedDates.tsx` | 除外対象日表示 | 要変更 |
| `src/app/forecast-accuracy/page.tsx` | 評価ページ | 要変更（表示追加） |
| `src/lib/queries/backtest.ts` | バックテスト DB クエリ | 要確認 |
| `docs/long-event-policy-design.md` | 本ドキュメント | 本 Issue の成果物 |
| `docs/forecast-model-analysis-and-roadmap.md` | モデル分析・ロードマップ | 必要なら補足追記 |
