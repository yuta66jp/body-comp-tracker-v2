-- #775 増量計画開始日と開始体重の整合性テスト

BEGIN;

DELETE FROM settings
WHERE key IN (
  'current_season',
  'current_phase',
  'contest_date',
  'goal_weight',
  'monthly_plan_start_month',
  'monthly_plan_start_weight',
  'monthly_plan_overrides'
);

INSERT INTO auth.users(id)
VALUES ('77500000-0000-0000-0000-000000000001');

INSERT INTO daily_logs(user_id, log_date, weight)
VALUES
  ('77500000-0000-0000-0000-000000000001', '2026-08-01', 70),
  ('77500000-0000-0000-0000-000000000001', '2026-09-01', 65);

INSERT INTO seasons(
  user_id, name, phase, start_date, start_weight, target_date, target_weight,
  status, monthly_plan_start_date, monthly_plan_start_month,
  monthly_plan_start_weight, monthly_plan_overrides
) VALUES (
  '77500000-0000-0000-0000-000000000001',
  '2026_AdjustmentBulk',
  'Bulk',
  '2026-08-01',
  70,
  '2026-12-31',
  69,
  'active',
  '2026-08-01',
  '2026-08',
  70,
  '[{"month":"2026-08","targetWeight":65},{"month":"2026-09","targetWeight":66},{"month":"2026-10","targetWeight":67}]'::JSONB
);

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '77500000-0000-0000-0000-000000000001';

DO $$
DECLARE
  v_season_id BIGINT;
  v_updated_at TIMESTAMPTZ;
BEGIN
  SELECT id, updated_at INTO v_season_id, v_updated_at
  FROM seasons WHERE status = 'active';

  PERFORM update_active_season_plan_start(v_season_id, v_updated_at, '2026-09-01');

  IF NOT EXISTS (
    SELECT 1 FROM seasons
    WHERE id = v_season_id
      AND monthly_plan_start_date = '2026-09-01'
      AND monthly_plan_start_month = '2026-09'
      AND monthly_plan_start_weight = 65
      AND monthly_plan_overrides = '[{"month":"2026-09","targetWeight":66},{"month":"2026-10","targetWeight":67}]'::JSONB
  ) THEN
    RAISE EXCEPTION 'plan start was not rebased to the exact daily weight';
  END IF;

  BEGIN
    SELECT updated_at INTO v_updated_at FROM seasons WHERE id = v_season_id;
    PERFORM update_active_season_plan_start(v_season_id, v_updated_at, '2026-08-15');
    RAISE EXCEPTION 'missing daily weight unexpectedly accepted';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE '%season_plan_start_weight_missing%' THEN RAISE; END IF;
  END;
END
$$;

UPDATE daily_logs SET weight = 64.8 WHERE log_date = '2026-09-01';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM seasons
    WHERE status = 'active' AND monthly_plan_start_weight = 64.8
  ) THEN
    RAISE EXCEPTION 'daily weight correction did not update the plan baseline';
  END IF;

  BEGIN
    UPDATE daily_logs SET weight = NULL WHERE log_date = '2026-09-01';
    RAISE EXCEPTION 'referenced daily weight unexpectedly cleared';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE '%season_plan_start_log_required%' THEN RAISE; END IF;
  END;

  BEGIN
    DELETE FROM daily_logs WHERE log_date = '2026-09-01';
    RAISE EXCEPTION 'referenced daily log unexpectedly deleted';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE '%season_plan_start_log_required%' THEN RAISE; END IF;
  END;
END
$$;

ROLLBACK;
