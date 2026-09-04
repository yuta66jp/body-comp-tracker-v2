-- 食事未記録を NULL に統一し、0 kcal を実測値として保存しない。
--
-- このアプリでは絶食を記録しないため、食事記録の意味論を次に統一する。
--   calories > 0 : 食事記録あり
--   calories IS NULL かつ P/F/C IS NULL : 食事未記録

-- 既存の全項目 0 を食事未記録へ補正する。
-- 本番事前確認時点では 2026-09-03 の 1 行が対象。
UPDATE daily_logs
SET
  calories = NULL,
  protein  = NULL,
  fat      = NULL,
  carbs    = NULL
WHERE
  calories = 0
  AND protein = 0
  AND fat = 0
  AND carbs = 0;

ALTER TABLE daily_logs
  DROP CONSTRAINT IF EXISTS daily_logs_calories_check;
ALTER TABLE daily_logs
  ADD CONSTRAINT daily_logs_calories_check
    CHECK (calories IS NULL OR (calories > 0 AND calories <= 99999));

ALTER TABLE daily_logs
  DROP CONSTRAINT IF EXISTS daily_logs_nutrition_record_check;
ALTER TABLE daily_logs
  ADD CONSTRAINT daily_logs_nutrition_record_check
    CHECK (
      calories IS NOT NULL
      OR (protein IS NULL AND fat IS NULL AND carbs IS NULL)
    );

COMMENT ON COLUMN daily_logs.calories IS
  '摂取カロリー。正数は食事記録あり、NULL は食事未記録。0 は保存しない。';
