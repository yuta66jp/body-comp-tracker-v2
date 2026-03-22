-- daily_logs の数値カラムに DB レベルの CHECK 制約を追加する
--
-- 目的:
--   Server Action (saveDailyLog) 側でバリデーションを実施しているが、
--   どの経路からでも壊れたデータが入らないよう DB 制約で二重に保証する。
--
-- 制約範囲は saveDailyLog.ts のバリデーション値と一致させる:
--   weight      : 0〜300 kg
--   calories    : 0〜99999 kcal
--   protein     : 0〜99999 g
--   fat         : 0〜99999 g
--   carbs       : 0〜99999 g
--   sleep_hours : 0〜24 h
--
-- NULL は未記録を意味するため制約の対象外とする。
-- PostgreSQL の CHECK 制約は NULL に対して UNKNOWN を返し通過するため、
-- IS NULL OR (...) のガードは記述上の明示化が目的。
--
-- 冪等性: DROP CONSTRAINT IF EXISTS で既存制約を削除してから追加する。

ALTER TABLE daily_logs
  DROP CONSTRAINT IF EXISTS daily_logs_weight_check;
ALTER TABLE daily_logs
  ADD CONSTRAINT daily_logs_weight_check
    CHECK (weight IS NULL OR (weight >= 0 AND weight <= 300));

ALTER TABLE daily_logs
  DROP CONSTRAINT IF EXISTS daily_logs_calories_check;
ALTER TABLE daily_logs
  ADD CONSTRAINT daily_logs_calories_check
    CHECK (calories IS NULL OR (calories >= 0 AND calories <= 99999));

ALTER TABLE daily_logs
  DROP CONSTRAINT IF EXISTS daily_logs_protein_check;
ALTER TABLE daily_logs
  ADD CONSTRAINT daily_logs_protein_check
    CHECK (protein IS NULL OR (protein >= 0 AND protein <= 99999));

ALTER TABLE daily_logs
  DROP CONSTRAINT IF EXISTS daily_logs_fat_check;
ALTER TABLE daily_logs
  ADD CONSTRAINT daily_logs_fat_check
    CHECK (fat IS NULL OR (fat >= 0 AND fat <= 99999));

ALTER TABLE daily_logs
  DROP CONSTRAINT IF EXISTS daily_logs_carbs_check;
ALTER TABLE daily_logs
  ADD CONSTRAINT daily_logs_carbs_check
    CHECK (carbs IS NULL OR (carbs >= 0 AND carbs <= 99999));

ALTER TABLE daily_logs
  DROP CONSTRAINT IF EXISTS daily_logs_sleep_hours_check;
ALTER TABLE daily_logs
  ADD CONSTRAINT daily_logs_sleep_hours_check
    CHECK (sleep_hours IS NULL OR (sleep_hours >= 0 AND sleep_hours <= 24));
