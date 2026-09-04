-- #778 食事未記録の NULL 意味論と DB 制約のテスト

BEGIN;

INSERT INTO auth.users(id)
VALUES ('77800000-0000-0000-0000-000000000001');

INSERT INTO daily_logs(user_id, log_date, weight, calories, protein, fat, carbs)
VALUES
  ('77800000-0000-0000-0000-000000000001', '2026-09-01', 65, NULL, NULL, NULL, NULL),
  ('77800000-0000-0000-0000-000000000001', '2026-09-02', 65, 1800, 150, 0, 200);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM daily_logs
    WHERE user_id = '77800000-0000-0000-0000-000000000001'
      AND log_date = '2026-09-01'
      AND calories IS NULL
      AND protein IS NULL
      AND fat IS NULL
      AND carbs IS NULL
  ) THEN
    RAISE EXCEPTION 'missing nutrition must remain all NULL';
  END IF;

  BEGIN
    INSERT INTO daily_logs(user_id, log_date, weight, calories, protein, fat, carbs)
    VALUES ('77800000-0000-0000-0000-000000000001', '2026-09-03', 65, 0, 0, 0, 0);
    RAISE EXCEPTION 'zero calories unexpectedly accepted';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO daily_logs(user_id, log_date, weight, calories, protein, fat, carbs)
    VALUES ('77800000-0000-0000-0000-000000000001', '2026-09-04', 65, NULL, 150, 50, 200);
    RAISE EXCEPTION 'macros without calories unexpectedly accepted';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;
END
$$;

ROLLBACK;
