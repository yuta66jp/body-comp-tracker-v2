-- #778 / #782 食事未記録の NULL 意味論、初期値、体重同期の DB テスト

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

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '77800000-0000-0000-0000-000000000001';

-- Google Health と同じく食事項目を省略する。新規日付は全 NULL になる。
INSERT INTO daily_logs(user_id, log_date, weight)
VALUES ('77800000-0000-0000-0000-000000000001', '2026-09-05', 64.8)
ON CONFLICT (user_id, log_date) DO UPDATE
SET user_id = EXCLUDED.user_id, log_date = EXCLUDED.log_date, weight = EXCLUDED.weight;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM daily_logs
    WHERE user_id = '77800000-0000-0000-0000-000000000001'
      AND log_date = '2026-09-05'
      AND weight = 64.8
      AND calories IS NULL AND protein IS NULL AND fat IS NULL AND carbs IS NULL
  ) THEN
    RAISE EXCEPTION 'weight-only insert must default missing nutrition to NULL';
  END IF;
END
$$;

-- 既存日付も INSERT 側の初期値が検証される。食事記録は更新対象に含めない。
INSERT INTO daily_logs(user_id, log_date, weight)
VALUES ('77800000-0000-0000-0000-000000000001', '2026-09-02', 64.9)
ON CONFLICT (user_id, log_date) DO UPDATE
SET user_id = EXCLUDED.user_id, log_date = EXCLUDED.log_date, weight = EXCLUDED.weight;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM daily_logs
    WHERE user_id = '77800000-0000-0000-0000-000000000001'
      AND log_date = '2026-09-02'
      AND weight = 64.9
      AND calories = 1800 AND protein = 150 AND fat = 0 AND carbs = 200
  ) THEN
    RAISE EXCEPTION 'weight-only update must preserve recorded nutrition including zero macros';
  END IF;
END
$$;

-- 未記録・記録済みの既存日付と新規日付をまとめて同期する。
INSERT INTO daily_logs(user_id, log_date, weight)
VALUES
  ('77800000-0000-0000-0000-000000000001', '2026-09-01', 64.7),
  ('77800000-0000-0000-0000-000000000001', '2026-09-02', 64.6),
  ('77800000-0000-0000-0000-000000000001', '2026-09-06', 64.5)
ON CONFLICT (user_id, log_date) DO UPDATE
SET user_id = EXCLUDED.user_id, log_date = EXCLUDED.log_date, weight = EXCLUDED.weight;

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM daily_logs
      WHERE user_id = '77800000-0000-0000-0000-000000000001') <> 4
     OR EXISTS (
       SELECT * FROM (VALUES
         ('2026-09-01'::DATE, 64.7, NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC),
         ('2026-09-02'::DATE, 64.6, 1800, 150, 0, 200),
         ('2026-09-05'::DATE, 64.8, NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC),
         ('2026-09-06'::DATE, 64.5, NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC)
       ) AS expected(log_date, weight, calories, protein, fat, carbs)
       EXCEPT
       SELECT log_date, weight, calories, protein, fat, carbs FROM daily_logs
       WHERE user_id = '77800000-0000-0000-0000-000000000001'
     ) THEN
    RAISE EXCEPTION 'mixed weight-only upsert must preserve existing nutrition and default new nutrition to NULL';
  END IF;
END
$$;

ROLLBACK;
