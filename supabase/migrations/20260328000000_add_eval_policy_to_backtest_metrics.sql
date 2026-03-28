-- #363: evaluation policy サポート追加
-- forecast_backtest_metrics に eval_policy / n_total / n_excluded を追加し、
-- 1 run × model × horizon に対して複数 policy の metrics を保持できる構造にする。
--
-- 変更内容:
--   1. eval_policy TEXT NOT NULL DEFAULT 'all_days'
--   2. n_total INT NOT NULL DEFAULT 0  (policy 適用前の総予測点数)
--   3. n_excluded INT NOT NULL DEFAULT 0  (policy により除外された点数)
--   4. UNIQUE 制約を (run_id, model_name, horizon_days, eval_policy) に更新
--
-- 既存行の扱い:
--   - eval_policy = 'all_days' (DEFAULT) が自動設定される
--   - n_total は n_predictions から backfill (all_days なので total = used)
--   - n_excluded = 0 (all_days は除外なし)
--
-- 後続 #364 向け補足:
--   eval_policy='all_days' と eval_policy='exclude_flagged_plus_recovery' を
--   同一 run_id でクエリし、比較表示に使う。

-- 1. 新カラム追加
ALTER TABLE forecast_backtest_metrics
  ADD COLUMN IF NOT EXISTS eval_policy  TEXT NOT NULL DEFAULT 'all_days',
  ADD COLUMN IF NOT EXISTS n_total      INT  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS n_excluded   INT  NOT NULL DEFAULT 0;

-- 2. 既存行: n_total を n_predictions から backfill (all_days policy のため total = used)
UPDATE forecast_backtest_metrics
SET n_total = n_predictions
WHERE n_total = 0 AND n_predictions > 0;

-- 3. 旧 UNIQUE 制約を削除
--    PostgreSQL の自動生成名: {tablename}_{cols}_key
ALTER TABLE forecast_backtest_metrics
  DROP CONSTRAINT IF EXISTS forecast_backtest_metrics_run_id_model_name_horizon_days_key;

-- 4. 新 UNIQUE 制約: eval_policy を含む
ALTER TABLE forecast_backtest_metrics
  ADD CONSTRAINT forecast_backtest_metrics_run_model_horizon_policy_key
  UNIQUE (run_id, model_name, horizon_days, eval_policy);

-- 5. eval_policy 検索用インデックス (#364 の比較クエリで使用)
CREATE INDEX IF NOT EXISTS idx_backtest_metrics_eval_policy
  ON forecast_backtest_metrics (run_id, eval_policy);
