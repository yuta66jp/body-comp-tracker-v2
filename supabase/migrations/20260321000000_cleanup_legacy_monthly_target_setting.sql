-- #134: legacy settings key 'monthly_target' の DB レベル整理
--
-- #132 でアプリケーション上の monthly_target 参照（UI / schema / domain / chart）は削除済み。
-- 本 migration では、過去に保存された可能性のある DB 上の残存行を削除する。
--
-- 影響:
--   - settings テーブルの key = 'monthly_target' の行を削除する（存在しなければ no-op）
--   - アプリはすでにこのキーを読み書きしないため、動作に変化はない
--   - 月次目標は buildMonthlyGoalPlan (#101) + monthly_plan_overrides (value_str) で管理する

DELETE FROM settings WHERE key = 'monthly_target';
