-- Restrict batch-generated / derived personal data to authenticated sessions.
--
-- These tables are written by ML / analytics jobs and do not have user_id yet.
-- For the current single-user app, authenticated-only reads are the intended
-- hardening boundary; service_role keeps its RLS bypass behavior for batch jobs.

-- predictions / analytics_cache
DROP POLICY IF EXISTS "anon can read predictions" ON predictions;
DROP POLICY IF EXISTS "anon can read analytics_cache" ON analytics_cache;
DROP POLICY IF EXISTS "authenticated can read predictions" ON predictions;
DROP POLICY IF EXISTS "authenticated can read analytics_cache" ON analytics_cache;

CREATE POLICY "authenticated can read predictions"
  ON predictions FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated can read analytics_cache"
  ON analytics_cache FOR SELECT TO authenticated USING (true);

-- career_logs
DROP POLICY IF EXISTS "anon can read career_logs" ON career_logs;
DROP POLICY IF EXISTS "authenticated can read career_logs" ON career_logs;

CREATE POLICY "authenticated can read career_logs"
  ON career_logs FOR SELECT TO authenticated USING (true);

-- forecast_backtest_*
DROP POLICY IF EXISTS "anon can read forecast_backtest_runs" ON forecast_backtest_runs;
DROP POLICY IF EXISTS "anon can read forecast_backtest_metrics" ON forecast_backtest_metrics;
DROP POLICY IF EXISTS "anon can read forecast_backtest_predictions" ON forecast_backtest_predictions;
DROP POLICY IF EXISTS "authenticated can read forecast_backtest_runs" ON forecast_backtest_runs;
DROP POLICY IF EXISTS "authenticated can read forecast_backtest_metrics" ON forecast_backtest_metrics;
DROP POLICY IF EXISTS "authenticated can read forecast_backtest_predictions" ON forecast_backtest_predictions;

CREATE POLICY "authenticated can read forecast_backtest_runs"
  ON forecast_backtest_runs FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated can read forecast_backtest_metrics"
  ON forecast_backtest_metrics FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated can read forecast_backtest_predictions"
  ON forecast_backtest_predictions FOR SELECT TO authenticated USING (true);
