-- #741 seasons migration smoke test
-- 実行例: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/seasons.test.sql

BEGIN;

INSERT INTO auth.users(id)
VALUES
  ('74100000-0000-0000-0000-000000000001'),
  ('74100000-0000-0000-0000-000000000002');

INSERT INTO seasons (
  user_id, name, phase, start_date, start_weight, target_date, target_weight,
  status, end_date, end_weight
) VALUES (
  '74100000-0000-0000-0000-000000000001',
  'test_bulk',
  'Bulk',
  '2026-01-01',
  70,
  '2026-03-31',
  75,
  'completed',
  '2026-03-31',
  74.5
);

INSERT INTO seasons (
  user_id, name, phase, start_date, start_weight, target_date, target_weight,
  status
) VALUES (
  '74100000-0000-0000-0000-000000000001',
  'test_cut',
  'Cut',
  '2026-04-01',
  74.5,
  '2026-08-30',
  68,
  'active'
);

DO $$
DECLARE
  v_active_id BIGINT;
  v_previous_id BIGINT;
BEGIN
  SELECT id INTO v_active_id
  FROM seasons
  WHERE user_id = '74100000-0000-0000-0000-000000000001'
    AND status = 'active';

  SELECT id INTO v_previous_id
  FROM seasons
  WHERE user_id = '74100000-0000-0000-0000-000000000001'
    AND status = 'completed';

  IF resolve_season_id(
    '74100000-0000-0000-0000-000000000001',
    '2026-03-31'
  ) IS DISTINCT FROM v_previous_id THEN
    RAISE EXCEPTION 'the previous season must own the day before transition';
  END IF;

  IF resolve_season_id(
    '74100000-0000-0000-0000-000000000001',
    '2026-04-01'
  ) IS DISTINCT FROM v_active_id THEN
    RAISE EXCEPTION 'the new season must own the transition day';
  END IF;

  IF resolve_season_id(
    '74100000-0000-0000-0000-000000000001',
    '2025-12-31'
  ) IS NOT NULL THEN
    RAISE EXCEPTION 'out-of-period logs must remain unassigned';
  END IF;

  BEGIN
    INSERT INTO seasons (
      user_id, name, phase, start_date, start_weight, target_date,
      target_weight, status
    ) VALUES (
      '74100000-0000-0000-0000-000000000001',
      'duplicate_active',
      'Bulk',
      '2027-01-01',
      70,
      '2027-06-01',
      75,
      'active'
    );
    RAISE EXCEPTION 'duplicate active season unexpectedly succeeded';
  EXCEPTION
    WHEN unique_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO seasons (
      user_id, name, phase, start_date, start_weight, target_date,
      target_weight, status, end_date
    ) VALUES (
      '74100000-0000-0000-0000-000000000001',
      'overlapping_completed',
      'Cut',
      '2026-03-01',
      72,
      '2026-04-30',
      NULL,
      'completed',
      '2026-04-30'
    );
    RAISE EXCEPTION 'overlapping season unexpectedly succeeded';
  EXCEPTION
    WHEN exclusion_violation THEN NULL;
  END;
END
$$;

INSERT INTO daily_logs(user_id, log_date, weight)
VALUES (
  '74100000-0000-0000-0000-000000000001',
  '2026-04-01',
  74.5
);

DO $$
BEGIN
  IF (
    SELECT season_id IS NULL
    FROM daily_logs
    WHERE user_id = '74100000-0000-0000-0000-000000000001'
      AND log_date = '2026-04-01'
  ) THEN
    RAISE EXCEPTION 'daily log trigger did not assign season_id';
  END IF;
END
$$;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '74100000-0000-0000-0000-000000000001';

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM seasons) <> 2 THEN
    RAISE EXCEPTION 'owner RLS must expose exactly the owner seasons';
  END IF;
END
$$;

SET LOCAL request.jwt.claim.sub = '74100000-0000-0000-0000-000000000002';

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM seasons) <> 0 THEN
    RAISE EXCEPTION 'RLS exposed another owner seasons';
  END IF;
END
$$;

RESET ROLE;
ROLLBACK;
