-- Drop meal detail logs (#732)
--
-- #728 added meal_entries / meal_items as detailed meal storage.
-- The app is returning to daily_logs.calories/protein/fat/carbs as the
-- nutrition source, so the detail tables and their helper functions are
-- removed. Existing meal detail rows are intentionally deleted.

DROP TABLE IF EXISTS meal_items CASCADE;
DROP TABLE IF EXISTS meal_entries CASCADE;

DROP FUNCTION IF EXISTS sync_daily_log_nutrition_from_meal_item() CASCADE;
DROP FUNCTION IF EXISTS recalc_daily_log_nutrition(UUID, DATE) CASCADE;
DROP FUNCTION IF EXISTS set_updated_at_meal_items() CASCADE;
DROP FUNCTION IF EXISTS set_updated_at_meal_entries() CASCADE;
