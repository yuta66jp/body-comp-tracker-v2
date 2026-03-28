-- #363 フォローアップ: n_used=0 の policy 行を保存できるよう mae / rmse を nullable に変更
--
-- 背景:
--   exclude_flagged_plus_recovery policy で全件除外になった場合、
--   mae / rmse が NULL の状態で行を保存する必要がある。
--   #364 が run_id + eval_policy で比較クエリする際に、
--   「policy 行が存在しない」 と「全件除外だった (n_used=0)」を区別するため。
--
-- 変更:
--   mae  NUMERIC NOT NULL → NUMERIC (nullable)
--   rmse NUMERIC NOT NULL → NUMERIC (nullable)
--   (bias は元から nullable。mape も元から nullable。変更不要)

ALTER TABLE forecast_backtest_metrics
  ALTER COLUMN mae  DROP NOT NULL,
  ALTER COLUMN rmse DROP NOT NULL;
