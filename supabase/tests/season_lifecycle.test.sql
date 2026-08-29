-- #742 season lifecycle RPC integration test
-- 実行例: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/season_lifecycle.test.sql

BEGIN;

-- settings.key はsingle-user global PKのため、transaction内だけ対象mirrorを空にする。
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
VALUES ('74200000-0000-0000-0000-000000000001');

INSERT INTO daily_logs(user_id, log_date, weight)
VALUES
  ('74200000-0000-0000-0000-000000000001', '1900-01-01', 75),
  ('74200000-0000-0000-0000-000000000001', '1900-03-01', 76),
  ('74200000-0000-0000-0000-000000000001', '1900-04-01', 77);

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '74200000-0000-0000-0000-000000000001';

DO $$
DECLARE
  v_bulk_id BIGINT;
  v_cut_id BIGINT;
  v_no_end_weight_id BIGINT;
BEGIN
  v_bulk_id := start_or_switch_season(
    NULL,
    '1900_Bulk',
    'Bulk',
    '1900-01-01',
    '1900-06-30',
    80
  );

  IF NOT EXISTS (
    SELECT 1 FROM seasons
    WHERE id = v_bulk_id
      AND status = 'active'
      AND start_weight = 75
      AND monthly_plan_start_month = '1900-01'
      AND monthly_plan_start_weight = 75
      AND monthly_plan_overrides = '[]'::JSONB
  ) THEN
    RAISE EXCEPTION 'initial season was not created with its plan baseline';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM settings
    WHERE key = 'current_phase'
      AND value_str = 'Bulk'
      AND user_id = '74200000-0000-0000-0000-000000000001'
  ) THEN
    RAISE EXCEPTION 'settings mirror was not initialized';
  END IF;

  v_cut_id := start_or_switch_season(
    v_bulk_id,
    '1900_Cut',
    'Cut',
    '1900-04-01',
    '1900-09-30',
    68
  );

  IF NOT EXISTS (
    SELECT 1 FROM seasons
    WHERE id = v_bulk_id
      AND status = 'completed'
      AND end_date = '1900-03-31'
      AND end_weight = 76
  ) THEN
    RAISE EXCEPTION 'previous season was not completed on the transition eve';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM seasons
    WHERE id = v_cut_id
      AND status = 'active'
      AND start_date = '1900-04-01'
      AND start_weight = 77
  ) THEN
    RAISE EXCEPTION 'next season was not created on the transition day';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM daily_logs
    WHERE log_date = '1900-04-01'
      AND season_id = v_cut_id
  ) THEN
    RAISE EXCEPTION 'transition-day log was not reassigned to the next season';
  END IF;

  -- 同じrequestの二重送信は期待したactive idが変わり、transaction全体がno-opになる。
  BEGIN
    PERFORM start_or_switch_season(
      v_bulk_id,
      '1900_Cut',
      'Cut',
      '1900-04-01',
      '1900-09-30',
      68
    );
    RAISE EXCEPTION 'duplicate transition unexpectedly succeeded';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE '%active_season_changed%' THEN
        RAISE;
      END IF;
  END;

  IF (SELECT COUNT(*) FROM seasons WHERE status = 'active') <> 1
     OR (SELECT COUNT(*) FROM seasons) <> 2 THEN
    RAISE EXCEPTION 'duplicate request left a partial season state';
  END IF;

  BEGIN
    PERFORM update_active_season_goal(v_bulk_id, '1900-12-31', 66);
    RAISE EXCEPTION 'stale goal update unexpectedly changed the next season';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE '%active_season_changed%' THEN
        RAISE;
      END IF;
  END;

  PERFORM update_active_season_goal(v_cut_id, '1900-10-31', 67.5);
  IF NOT EXISTS (
    SELECT 1 FROM seasons
    WHERE id = v_cut_id
      AND target_date = '1900-10-31'
      AND target_weight = 67.5
  ) OR NOT EXISTS (
    SELECT 1 FROM settings
    WHERE key = 'goal_weight'
      AND value_num = 67.5
  ) THEN
    RAISE EXCEPTION 'goal update did not update season and settings atomically';
  END IF;

  PERFORM end_active_season(v_cut_id, '1900-05-01');
  IF EXISTS (SELECT 1 FROM seasons WHERE status = 'active') THEN
    RAISE EXCEPTION 'season remained active after explicit end';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM seasons
    WHERE id = v_cut_id
      AND status = 'completed'
      AND end_date = '1900-05-01'
      AND end_weight = 77
  ) THEN
    RAISE EXCEPTION 'season end did not preserve the latest end weight';
  END IF;
  IF EXISTS (
    SELECT 1 FROM settings
    WHERE key = 'current_season'
      AND value_str IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'current settings were not cleared after season end';
  END IF;

  v_no_end_weight_id := start_or_switch_season(
    NULL,
    '1901_Bulk',
    'Bulk',
    '1901-01-01',
    '1901-06-30',
    80
  );
  UPDATE daily_logs
     SET weight = NULL
   WHERE user_id = '74200000-0000-0000-0000-000000000001';
  PERFORM end_active_season(v_no_end_weight_id, '1901-02-01');
  IF NOT EXISTS (
    SELECT 1 FROM seasons
    WHERE id = v_no_end_weight_id
      AND status = 'completed'
      AND end_weight IS NULL
  ) THEN
    RAISE EXCEPTION 'season end must allow a missing end weight';
  END IF;

  BEGIN
    PERFORM start_or_switch_season(
      NULL,
      '1899_Cut',
      'Cut',
      '1899-01-01',
      '1899-12-31',
      68
    );
    RAISE EXCEPTION 'season without start weight unexpectedly succeeded';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE '%season_start_weight_missing%' THEN
        RAISE;
      END IF;
  END;
END
$$;

RESET ROLE;

-- RPC ownerや管理経路からでも、識別情報と完了済み履歴は直接変更できない。
INSERT INTO seasons (
  user_id,
  name,
  phase,
  start_date,
  start_weight,
  target_date,
  target_weight,
  status,
  monthly_plan_start_month,
  monthly_plan_start_weight,
  monthly_plan_overrides
) VALUES (
  '74200000-0000-0000-0000-000000000001',
  '1902_Immutable',
  'Cut',
  '1902-01-01',
  70,
  '1902-06-30',
  65,
  'active',
  '1902-01',
  70,
  '[]'::JSONB
);

DO $$
BEGIN
  BEGIN
    UPDATE seasons SET phase = 'Bulk' WHERE name = '1902_Immutable';
    RAISE EXCEPTION 'active season phase was directly overwritten';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE '%season_identity_immutable%' THEN
        RAISE;
      END IF;
  END;

  UPDATE seasons
     SET status = 'completed', end_date = '1902-06-30'
   WHERE name = '1902_Immutable';

  BEGIN
    UPDATE seasons SET target_weight = 64 WHERE name = '1902_Immutable';
    RAISE EXCEPTION 'completed season was directly overwritten';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE '%completed_season_read_only%' THEN
        RAISE;
      END IF;
  END;
END
$$;

ROLLBACK;
