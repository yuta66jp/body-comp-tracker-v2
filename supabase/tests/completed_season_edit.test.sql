-- #753 completed season edit RPC integration test
-- 実行例: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/completed_season_edit.test.sql

BEGIN;

INSERT INTO auth.users(id)
VALUES
  ('75300000-0000-0000-0000-000000000001'),
  ('75300000-0000-0000-0000-000000000002');

DO $$
DECLARE
  v_completed_id BIGINT;
  v_next_id BIGINT;
BEGIN
  INSERT INTO seasons (
    user_id, name, phase, start_date, start_weight, target_date, target_weight,
    status, end_date, end_weight, monthly_plan_start_month,
    monthly_plan_start_weight, monthly_plan_overrides, monthly_plan_snapshot
  ) VALUES (
    '75300000-0000-0000-0000-000000000001', '1903_Cut', 'Cut',
    '1903-01-01', 80, '1903-04-30', 74, 'completed', '1903-02-28', 77,
    '1903-01', 80, '[]'::JSONB,
    '[
      {"month":"1903-01","targetWeight":78,"source":"auto_redistributed","requiredDeltaKg":-2,"actualWeight":80},
      {"month":"1903-02","targetWeight":76,"source":"auto_redistributed","requiredDeltaKg":-2,"actualWeight":78},
      {"month":"1903-03","targetWeight":75,"source":"auto_redistributed","requiredDeltaKg":-1,"actualWeight":null},
      {"month":"1903-04","targetWeight":74,"source":"auto_redistributed","requiredDeltaKg":-1,"actualWeight":null}
    ]'::JSONB
  ) RETURNING id INTO v_completed_id;

  INSERT INTO seasons (
    user_id, name, phase, start_date, start_weight, target_date, target_weight,
    status, monthly_plan_start_month, monthly_plan_start_weight,
    monthly_plan_overrides
  ) VALUES (
    '75300000-0000-0000-0000-000000000001', '1903_Bulk', 'Bulk',
    '1903-03-15', 76, '1903-06-30', 82, 'active', '1903-03', 76, '[]'::JSONB
  ) RETURNING id INTO v_next_id;

  INSERT INTO daily_logs(user_id, log_date, weight)
  VALUES
    ('75300000-0000-0000-0000-000000000001', '1903-01-31', 79),
    ('75300000-0000-0000-0000-000000000001', '1903-02-28', 77),
    ('75300000-0000-0000-0000-000000000001', '1903-03-01', 76),
    ('75300000-0000-0000-0000-000000000001', '1903-03-15', 76.5);

  INSERT INTO career_logs(user_id, season_id, log_date, weight, season, target_date)
  VALUES (
    '75300000-0000-0000-0000-000000000001', v_completed_id,
    '1903-02-20', 77.5, '1903_Cut', '1903-04-30'
  );

  INSERT INTO seasons (
    user_id, name, phase, start_date, start_weight, target_date, target_weight,
    status, end_date, end_weight, monthly_plan_start_month,
    monthly_plan_start_weight, monthly_plan_overrides, monthly_plan_snapshot
  ) VALUES (
    '75300000-0000-0000-0000-000000000002', '1904_NoWeight', 'Cut',
    '1904-01-01', 70, '1904-04-30', 65, 'completed', '1904-02-28', NULL,
    '1904-01', 70, '[]'::JSONB, NULL
  );
END
$$;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '75300000-0000-0000-0000-000000000001';

DO $$
DECLARE
  v_completed_id BIGINT;
  v_updated_at TIMESTAMPTZ;
  v_snapshot JSONB;
BEGIN
  SELECT id, updated_at INTO v_completed_id, v_updated_at
  FROM seasons
  WHERE name = '1903_Cut';

  BEGIN
    PERFORM update_completed_season(
      v_completed_id, v_updated_at, '1903_Cut', 'Cut', '1903-02-10'
    );
    RAISE EXCEPTION 'career log was moved outside the season';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE '%completed_season_career_log_out_of_range%' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM update_completed_season(
      v_completed_id, v_updated_at, '1903_Cut', 'Cut', '1903-03-15'
    );
    RAISE EXCEPTION 'overlapping end date unexpectedly succeeded';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE '%completed_season_period_overlap%' THEN RAISE; END IF;
  END;

  PERFORM update_completed_season(
    v_completed_id, v_updated_at, '1903_Bulk_Preparation', 'Bulk', '1903-03-14'
  );

  SELECT monthly_plan_snapshot INTO v_snapshot
  FROM seasons
  WHERE id = v_completed_id
    AND name = '1903_Bulk_Preparation'
    AND phase = 'Bulk'
    AND end_date = '1903-03-14'
    AND end_weight = 76;
  IF v_snapshot IS NULL THEN
    RAISE EXCEPTION 'completed season was not updated';
  END IF;
  IF v_snapshot->0->>'targetWeight' <> '78'
     OR v_snapshot->0->>'source' <> 'auto_redistributed'
     OR v_snapshot->0->>'requiredDeltaKg' <> '-2'
     OR v_snapshot->0->>'actualWeight' <> '79'
     OR v_snapshot->1->>'actualWeight' <> '77'
     OR v_snapshot->2->>'actualWeight' <> '76'
     OR JSONB_TYPEOF(v_snapshot->3->'actualWeight') <> 'null' THEN
    RAISE EXCEPTION 'snapshot targets changed or actual weights were not recalculated';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM daily_logs
    WHERE user_id = '75300000-0000-0000-0000-000000000001'
      AND log_date = '1903-03-01'
      AND season_id = v_completed_id
  ) THEN
    RAISE EXCEPTION 'gap daily log was not assigned to the extended season';
  END IF;

  BEGIN
    PERFORM update_completed_season(
      v_completed_id, v_updated_at - INTERVAL '1 second', 'stale', 'Cut', '1903-03-14'
    );
    RAISE EXCEPTION 'stale update unexpectedly succeeded';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE '%completed_season_changed%' THEN RAISE; END IF;
  END;

  SELECT updated_at INTO v_updated_at FROM seasons WHERE id = v_completed_id;
  PERFORM update_completed_season(
    v_completed_id, v_updated_at, '1903_Bulk_Preparation', 'Bulk', '1903-02-28'
  );
  SELECT monthly_plan_snapshot INTO v_snapshot FROM seasons WHERE id = v_completed_id;
  IF EXISTS (
    SELECT 1 FROM daily_logs
    WHERE user_id = '75300000-0000-0000-0000-000000000001'
      AND log_date = '1903-03-01'
      AND season_id IS NOT NULL
  ) OR v_snapshot->2->'actualWeight' <> 'null'::JSONB THEN
    RAISE EXCEPTION 'shortened season did not unassign logs and clear monthly actuals';
  END IF;
END
$$;

SET LOCAL request.jwt.claim.sub = '75300000-0000-0000-0000-000000000002';

DO $$
DECLARE
  v_completed_id BIGINT;
  v_updated_at TIMESTAMPTZ;
  v_own_id BIGINT;
  v_own_updated_at TIMESTAMPTZ;
BEGIN
  SELECT id, updated_at INTO v_completed_id, v_updated_at
  FROM seasons
  WHERE name = '1903_Bulk_Preparation';
  BEGIN
    PERFORM update_completed_season(
      v_completed_id, v_updated_at, 'other-user', 'Cut', '1903-03-14'
    );
    RAISE EXCEPTION 'another owner updated the season';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE '%completed_season_not_found%' THEN RAISE; END IF;
  END;

  SELECT id, updated_at INTO v_own_id, v_own_updated_at
  FROM seasons
  WHERE name = '1904_NoWeight';
  PERFORM update_completed_season(
    v_own_id, v_own_updated_at, '1904_NoWeight_Adjusted', 'Bulk', '1904-03-10'
  );
  IF NOT EXISTS (
    SELECT 1 FROM seasons
    WHERE id = v_own_id
      AND name = '1904_NoWeight_Adjusted'
      AND end_weight IS NULL
      AND monthly_plan_snapshot IS NULL
  ) THEN
    RAISE EXCEPTION 'season without weight or snapshot was not preserved';
  END IF;
END
$$;

RESET ROLE;

DO $$
BEGIN
  BEGIN
    UPDATE seasons
    SET name = 'direct-update'
    WHERE name = '1903_Bulk_Preparation';
    RAISE EXCEPTION 'completed season was directly updated';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE '%completed_season_read_only%' THEN RAISE; END IF;
  END;
END
$$;

ROLLBACK;
