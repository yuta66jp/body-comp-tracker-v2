-- had_bowel_movement を nullable 化
--
-- 変更: BOOLEAN NOT NULL DEFAULT FALSE → BOOLEAN DEFAULT NULL
--
-- 目的:
--   「未記録 (null)」と「便通なし (false)」を DB レベルで区別できるようにする。
--   これにより三状態 (null=未記録 / false=便通なし / true=便通あり) が正しく保存される。
--
-- ⚠ 過去データの補正方針:
--   had_bowel_movement の記録機能は 2026-03-12 に実装された。
--   それ以前 (log_date < '2026-03-12') のレコードに入っている false は、
--   機能未実装期間に DB DEFAULT FALSE が自動適用されたものであり、
--   「便通なし」の観測値ではなく「未記録 (欠損)」として解釈すべきである。
--   そのため、該当レコードの had_bowel_movement を null に補正する。
--
--   2026-03-12 以降の false は実測値の可能性があるため補正しない。
--   補正対象は had_bowel_movement のみで、他カラムは変更しない。

-- Step 1: カラムを nullable 化
ALTER TABLE daily_logs
  ALTER COLUMN had_bowel_movement DROP NOT NULL,
  ALTER COLUMN had_bowel_movement SET DEFAULT NULL;

-- Step 2: 機能実装前 (log_date < '2026-03-12') の false を null に補正
--   理由: 当該期間は機能未実装であり、false は観測値ではなく DB DEFAULT の欠損値
UPDATE daily_logs
  SET had_bowel_movement = NULL
  WHERE log_date < '2026-03-12'
    AND had_bowel_movement = FALSE;

COMMENT ON COLUMN daily_logs.had_bowel_movement IS '排便状態: null=未記録, true=便通あり, false=便通なし';
