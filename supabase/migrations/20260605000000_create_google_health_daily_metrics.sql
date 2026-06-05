-- Google Health 日次メトリクス保存テーブルを作成する (#690)
--
-- 目的:
--   Google Health 由来の歩数・睡眠・HRV・安静時心拍数を daily_logs から分離し、
--   daily_logs を親、google_health_daily_metrics を子テーブルとして保存する。
--
-- 設計:
--   - 1行 = 1ユーザー・1日分の Google Health 日次メトリクス
--   - metric_date は daily_logs.log_date と同じ日付軸
--   - daily_logs が存在する日のみ保存できるよう、(user_id, metric_date) で FK を張る
--   - step_source / sleep_source は持たない。歩数・睡眠系データは Google Health 管理に寄せる
--
-- 旧 daily_logs.step_count / daily_logs.sleep_hours / sleep_sessions の削除は、
-- 保存・表示切り替え後の後続 Issue で扱う。

-- ── daily_logs 側の FK 参照前提 ───────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'uq_daily_logs_user_id_log_date'
       AND conrelid = 'daily_logs'::regclass
  ) THEN
    ALTER TABLE daily_logs
      ADD CONSTRAINT uq_daily_logs_user_id_log_date UNIQUE (user_id, log_date);
  END IF;
END $$;

COMMENT ON CONSTRAINT uq_daily_logs_user_id_log_date ON daily_logs IS
  'google_health_daily_metrics から (user_id, metric_date) で daily_logs を参照するための一意制約。';

-- ── テーブル作成 ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS google_health_daily_metrics (
  id                         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  metric_date                DATE        NOT NULL,
  step_count                 INTEGER,
  sleep_minutes              INTEGER,
  deep_sleep_minutes         INTEGER,
  sleep_bed_at               TIMESTAMPTZ,
  sleep_wake_at              TIMESTAMPTZ,
  hrv_ms                     NUMERIC,
  rhr_bpm                    NUMERIC,
  google_health_steps_source TEXT,
  synced_at                  TIMESTAMPTZ,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_google_health_daily_metrics_user_date
    UNIQUE (user_id, metric_date),
  CONSTRAINT fk_google_health_daily_metrics_daily_logs
    FOREIGN KEY (user_id, metric_date)
    REFERENCES daily_logs(user_id, log_date)
    ON DELETE CASCADE,
  CONSTRAINT chk_google_health_daily_metrics_step_count
    CHECK (step_count IS NULL OR step_count >= 0),
  CONSTRAINT chk_google_health_daily_metrics_sleep_minutes
    CHECK (sleep_minutes IS NULL OR sleep_minutes >= 0),
  CONSTRAINT chk_google_health_daily_metrics_deep_sleep_minutes
    CHECK (deep_sleep_minutes IS NULL OR deep_sleep_minutes >= 0),
  CONSTRAINT chk_google_health_daily_metrics_deep_sleep_lte_sleep
    CHECK (
      deep_sleep_minutes IS NULL
      OR sleep_minutes IS NULL
      OR deep_sleep_minutes <= sleep_minutes
    ),
  CONSTRAINT chk_google_health_daily_metrics_sleep_interval
    CHECK (
      sleep_bed_at IS NULL
      OR sleep_wake_at IS NULL
      OR sleep_bed_at < sleep_wake_at
    ),
  CONSTRAINT chk_google_health_daily_metrics_hrv_ms
    CHECK (hrv_ms IS NULL OR hrv_ms >= 0),
  CONSTRAINT chk_google_health_daily_metrics_rhr_bpm
    CHECK (rhr_bpm IS NULL OR rhr_bpm >= 0),
  CONSTRAINT chk_google_health_daily_metrics_steps_source
    CHECK (
      google_health_steps_source IS NULL
      OR google_health_steps_source IN ('reconcile', 'dailyRollUp', 'listFallback')
    )
);

COMMENT ON TABLE google_health_daily_metrics IS
  'Google Health 由来の日次メトリクス。daily_logs を親とし、1ユーザー・1日につき1行で保存する。';
COMMENT ON COLUMN google_health_daily_metrics.id IS 'UUID PK。';
COMMENT ON COLUMN google_health_daily_metrics.user_id IS 'Owner Supabase auth.users.id。';
COMMENT ON COLUMN google_health_daily_metrics.metric_date IS '日次キー。daily_logs.log_date に対応する。';
COMMENT ON COLUMN google_health_daily_metrics.step_count IS 'Google Health 由来の歩数。';
COMMENT ON COLUMN google_health_daily_metrics.sleep_minutes IS 'Google Health 由来の睡眠時間（分）。';
COMMENT ON COLUMN google_health_daily_metrics.deep_sleep_minutes IS 'Google Health 由来の深睡眠時間（分）。';
COMMENT ON COLUMN google_health_daily_metrics.sleep_bed_at IS 'Google Health の睡眠開始日時。';
COMMENT ON COLUMN google_health_daily_metrics.sleep_wake_at IS 'Google Health の睡眠終了日時。metric_date は起床日基準。';
COMMENT ON COLUMN google_health_daily_metrics.hrv_ms IS 'Google Health 由来の HRV（ms）。';
COMMENT ON COLUMN google_health_daily_metrics.rhr_bpm IS 'Google Health 由来の安静時心拍数（bpm）。';
COMMENT ON COLUMN google_health_daily_metrics.google_health_steps_source IS
  'Google Health 歩数取得で採用した API source: reconcile / dailyRollUp / listFallback。';
COMMENT ON COLUMN google_health_daily_metrics.synced_at IS 'Google Health との最終同期日時。';
COMMENT ON COLUMN google_health_daily_metrics.created_at IS '作成日時。';
COMMENT ON COLUMN google_health_daily_metrics.updated_at IS '最終更新日時。';

-- ── updated_at 自動更新トリガー ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at_google_health_daily_metrics()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_updated_at_google_health_daily_metrics
  ON google_health_daily_metrics;

CREATE TRIGGER trg_set_updated_at_google_health_daily_metrics
BEFORE UPDATE ON google_health_daily_metrics
FOR EACH ROW EXECUTE FUNCTION set_updated_at_google_health_daily_metrics();

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE google_health_daily_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated owner can select google_health_daily_metrics"
  ON google_health_daily_metrics;
DROP POLICY IF EXISTS "authenticated owner can insert google_health_daily_metrics"
  ON google_health_daily_metrics;
DROP POLICY IF EXISTS "authenticated owner can update google_health_daily_metrics"
  ON google_health_daily_metrics;
DROP POLICY IF EXISTS "authenticated owner can delete google_health_daily_metrics"
  ON google_health_daily_metrics;

CREATE POLICY "authenticated owner can select google_health_daily_metrics"
  ON google_health_daily_metrics FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "authenticated owner can insert google_health_daily_metrics"
  ON google_health_daily_metrics FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "authenticated owner can update google_health_daily_metrics"
  ON google_health_daily_metrics FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "authenticated owner can delete google_health_daily_metrics"
  ON google_health_daily_metrics FOR DELETE TO authenticated USING (user_id = auth.uid());
