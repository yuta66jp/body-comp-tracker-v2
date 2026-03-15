-- had_bowel_movement を nullable 化
--
-- 変更: BOOLEAN NOT NULL DEFAULT FALSE → BOOLEAN DEFAULT NULL
--
-- 目的:
--   「未記録 (null)」と「便通なし (false)」を DB レベルで区別できるようにする。
--   これにより三状態 (null=未記録 / false=便通なし / true=便通あり) が正しく保存される。
--
-- ⚠ 既存データに関する注意:
--   この migration 実行以前に保存された false 値は、
--   「未記録」と「便通なし」が区別できない状態で保存されている。
--   過去データの復元は不可能であり、今回の migration でデータの補正は行わない。
--   2026-03-15 以降の新規保存から三状態が正しく機能する。

ALTER TABLE daily_logs
  ALTER COLUMN had_bowel_movement DROP NOT NULL,
  ALTER COLUMN had_bowel_movement SET DEFAULT NULL;

COMMENT ON COLUMN daily_logs.had_bowel_movement IS '排便状態: null=未記録, true=便通あり, false=便通なし';
