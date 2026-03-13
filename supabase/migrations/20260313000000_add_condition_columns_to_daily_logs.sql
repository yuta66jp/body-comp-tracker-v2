-- Phase 2.5: コンディション記録項目の追加
--
-- 追加カラム:
--   sleep_hours       — 睡眠時間 (h). NUMERIC で小数点以下 1桁 (例: 7.5)
--   had_bowel_movement — 排便あり/なし
--   training_type     — トレーニング部位: chest/back/shoulders/glutes_hamstrings/quads
--   work_mode         — 仕事モード: off/office/remote/active/travel/other
--   leg_flag          — レッグ日フラグ (training_type から導出; ユーザー直接入力不可)
--
-- is_poor_sleep は既存のまま保持 (後方互換)。
-- UI からの入力は廃止するが DB カラムは削除しない。

ALTER TABLE daily_logs
  ADD COLUMN IF NOT EXISTS sleep_hours        NUMERIC(4,1),
  ADD COLUMN IF NOT EXISTS had_bowel_movement BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS training_type      TEXT,
  ADD COLUMN IF NOT EXISTS work_mode          TEXT,
  ADD COLUMN IF NOT EXISTS leg_flag           BOOLEAN;

-- CHECK 制約 (DB レベルでの整合性保証)
-- PostgreSQL は ADD CONSTRAINT IF NOT EXISTS 非サポートのため DO ブロックで冪等化
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'daily_logs_training_type_check'
  ) THEN
    ALTER TABLE daily_logs
      ADD CONSTRAINT daily_logs_training_type_check
        CHECK (training_type IN ('chest', 'back', 'shoulders', 'glutes_hamstrings', 'quads'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'daily_logs_work_mode_check'
  ) THEN
    ALTER TABLE daily_logs
      ADD CONSTRAINT daily_logs_work_mode_check
        CHECK (work_mode IN ('off', 'office', 'remote', 'active', 'travel', 'other'));
  END IF;
END $$;

COMMENT ON COLUMN daily_logs.sleep_hours        IS '睡眠時間 (時間, 小数1桁)';
COMMENT ON COLUMN daily_logs.had_bowel_movement IS '排便あり';
COMMENT ON COLUMN daily_logs.training_type      IS 'トレーニング部位: chest/back/shoulders/glutes_hamstrings/quads';
COMMENT ON COLUMN daily_logs.work_mode          IS '仕事モード: off/office/remote/active/travel/other';
COMMENT ON COLUMN daily_logs.leg_flag           IS 'レッグ日フラグ (training_type=quads|glutes_hamstrings → true, それ以外 → false, 未入力 → null)';
