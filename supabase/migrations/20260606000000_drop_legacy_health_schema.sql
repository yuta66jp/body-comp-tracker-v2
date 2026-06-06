-- Drop legacy manual health columns and sleep_sessions (#710)
--
-- Google Health daily metrics is the single source for steps and sleep values.
-- daily_logs keeps user-entered diet/body-condition fields only.

DROP TABLE IF EXISTS sleep_sessions CASCADE;
DROP FUNCTION IF EXISTS sync_sleep_hours_to_daily_logs();
DROP FUNCTION IF EXISTS set_updated_at_sleep_sessions();

CREATE OR REPLACE FUNCTION save_daily_log_partial(
  p_log_date DATE,
  p_fields   JSONB
) RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth_required';
  END IF;

  UPDATE daily_logs SET
    weight             = CASE WHEN p_fields ? 'weight'
                              THEN (p_fields->>'weight')::NUMERIC
                              ELSE weight             END,
    calories           = CASE WHEN p_fields ? 'calories'
                              THEN (p_fields->>'calories')::NUMERIC
                              ELSE calories           END,
    protein            = CASE WHEN p_fields ? 'protein'
                              THEN (p_fields->>'protein')::NUMERIC
                              ELSE protein            END,
    fat                = CASE WHEN p_fields ? 'fat'
                              THEN (p_fields->>'fat')::NUMERIC
                              ELSE fat                END,
    carbs              = CASE WHEN p_fields ? 'carbs'
                              THEN (p_fields->>'carbs')::NUMERIC
                              ELSE carbs              END,
    note               = CASE WHEN p_fields ? 'note'
                              THEN p_fields->>'note'
                              ELSE note               END,
    is_cheat_day       = CASE WHEN p_fields ? 'is_cheat_day'
                              THEN (p_fields->>'is_cheat_day')::BOOLEAN
                              ELSE is_cheat_day       END,
    is_refeed_day      = CASE WHEN p_fields ? 'is_refeed_day'
                              THEN (p_fields->>'is_refeed_day')::BOOLEAN
                              ELSE is_refeed_day      END,
    is_eating_out      = CASE WHEN p_fields ? 'is_eating_out'
                              THEN (p_fields->>'is_eating_out')::BOOLEAN
                              ELSE is_eating_out      END,
    is_travel_day      = CASE WHEN p_fields ? 'is_travel_day'
                              THEN (p_fields->>'is_travel_day')::BOOLEAN
                              ELSE is_travel_day      END,
    is_tanning_day     = CASE WHEN p_fields ? 'is_tanning_day'
                              THEN (p_fields->>'is_tanning_day')::BOOLEAN
                              ELSE is_tanning_day     END,
    is_posing_day      = CASE WHEN p_fields ? 'is_posing_day'
                              THEN (p_fields->>'is_posing_day')::BOOLEAN
                              ELSE is_posing_day      END,
    had_bowel_movement = CASE WHEN p_fields ? 'had_bowel_movement'
                              THEN (p_fields->>'had_bowel_movement')::BOOLEAN
                              ELSE had_bowel_movement END,
    training_type      = CASE WHEN p_fields ? 'training_type'
                              THEN p_fields->>'training_type'
                              ELSE training_type      END,
    work_mode          = CASE WHEN p_fields ? 'work_mode'
                              THEN p_fields->>'work_mode'
                              ELSE work_mode          END,
    leg_flag           = CASE WHEN p_fields ? 'leg_flag'
                              THEN (p_fields->>'leg_flag')::BOOLEAN
                              ELSE leg_flag           END
  WHERE log_date = p_log_date
    AND user_id = auth.uid();

  IF FOUND THEN
    RETURN;
  END IF;

  IF NOT (p_fields ? 'weight') OR (p_fields->>'weight') IS NULL THEN
    RAISE EXCEPTION 'new_log_requires_weight';
  END IF;

  INSERT INTO daily_logs (
    user_id,
    log_date,
    weight, calories, protein, fat, carbs, note,
    is_cheat_day, is_refeed_day, is_eating_out, is_travel_day,
    is_tanning_day, is_posing_day,
    had_bowel_movement,
    training_type, work_mode, leg_flag
  ) VALUES (
    auth.uid(),
    p_log_date,
    (p_fields->>'weight')::NUMERIC,
    (p_fields->>'calories')::NUMERIC,
    (p_fields->>'protein')::NUMERIC,
    (p_fields->>'fat')::NUMERIC,
    (p_fields->>'carbs')::NUMERIC,
    p_fields->>'note',
    COALESCE((p_fields->>'is_cheat_day')::BOOLEAN,   FALSE),
    COALESCE((p_fields->>'is_refeed_day')::BOOLEAN,  FALSE),
    COALESCE((p_fields->>'is_eating_out')::BOOLEAN,  FALSE),
    COALESCE((p_fields->>'is_travel_day')::BOOLEAN,  FALSE),
    COALESCE((p_fields->>'is_tanning_day')::BOOLEAN, FALSE),
    COALESCE((p_fields->>'is_posing_day')::BOOLEAN,  FALSE),
    (p_fields->>'had_bowel_movement')::BOOLEAN,
    p_fields->>'training_type',
    p_fields->>'work_mode',
    (p_fields->>'leg_flag')::BOOLEAN
  );
END;
$$;

COMMENT ON FUNCTION save_daily_log_partial(DATE, JSONB) IS
  'Authenticated owner-scoped daily log partial update/insert. Existing rows match log_date + auth.uid(); new rows set user_id = auth.uid().';

ALTER TABLE daily_logs
  DROP CONSTRAINT IF EXISTS daily_logs_sleep_hours_check,
  DROP COLUMN IF EXISTS step_count,
  DROP COLUMN IF EXISTS sleep_hours,
  DROP COLUMN IF EXISTS last_meal_end_time;
