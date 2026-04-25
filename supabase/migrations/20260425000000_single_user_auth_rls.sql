-- Single-user Auth / RLS hardening (#606)
--
-- 目的:
--   anon key だけで個人データを read/write/delete できる状態を廃止し、
--   Supabase Auth の authenticated user だけが自分の user_id 行を操作できるようにする。
--
-- 既存データ:
--   user_id は自動推測できないため NULL のまま残す。
--   適用後に owner user id を確認し、docs/security-single-user-auth.md の backfill SQL を実行すること。

ALTER TABLE daily_logs
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE sleep_sessions
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE food_master
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE menu_master
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_daily_logs_user_id_log_date ON daily_logs(user_id, log_date);
CREATE INDEX IF NOT EXISTS idx_sleep_sessions_user_id_wake_date ON sleep_sessions(user_id, wake_date);
CREATE INDEX IF NOT EXISTS idx_settings_user_id_key ON settings(user_id, key);
CREATE INDEX IF NOT EXISTS idx_food_master_user_id_name ON food_master(user_id, name);
CREATE INDEX IF NOT EXISTS idx_menu_master_user_id_name ON menu_master(user_id, name);

COMMENT ON COLUMN daily_logs.user_id IS 'Owner Supabase auth.users.id. NULL rows are legacy rows until owner backfill.';
COMMENT ON COLUMN sleep_sessions.user_id IS 'Owner Supabase auth.users.id. NULL rows are legacy rows until owner backfill.';
COMMENT ON COLUMN settings.user_id IS 'Owner Supabase auth.users.id. NULL rows are legacy rows until owner backfill.';
COMMENT ON COLUMN food_master.user_id IS 'Owner Supabase auth.users.id. NULL rows are legacy rows until owner backfill.';
COMMENT ON COLUMN menu_master.user_id IS 'Owner Supabase auth.users.id. NULL rows are legacy rows until owner backfill.';

-- ── Replace anon-wide policies with authenticated owner policies ─────────────

DROP POLICY IF EXISTS "anon can select daily_logs" ON daily_logs;
DROP POLICY IF EXISTS "anon can insert daily_logs" ON daily_logs;
DROP POLICY IF EXISTS "anon can update daily_logs" ON daily_logs;
DROP POLICY IF EXISTS "anon can delete daily_logs" ON daily_logs;

DROP POLICY IF EXISTS "authenticated owner can select daily_logs" ON daily_logs;
DROP POLICY IF EXISTS "authenticated owner can insert daily_logs" ON daily_logs;
DROP POLICY IF EXISTS "authenticated owner can update daily_logs" ON daily_logs;
DROP POLICY IF EXISTS "authenticated owner can delete daily_logs" ON daily_logs;

CREATE POLICY "authenticated owner can select daily_logs"
  ON daily_logs FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "authenticated owner can insert daily_logs"
  ON daily_logs FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "authenticated owner can update daily_logs"
  ON daily_logs FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "authenticated owner can delete daily_logs"
  ON daily_logs FOR DELETE TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "anon can select sleep_sessions" ON sleep_sessions;
DROP POLICY IF EXISTS "anon can insert sleep_sessions" ON sleep_sessions;
DROP POLICY IF EXISTS "anon can update sleep_sessions" ON sleep_sessions;
DROP POLICY IF EXISTS "anon can delete sleep_sessions" ON sleep_sessions;

DROP POLICY IF EXISTS "authenticated owner can select sleep_sessions" ON sleep_sessions;
DROP POLICY IF EXISTS "authenticated owner can insert sleep_sessions" ON sleep_sessions;
DROP POLICY IF EXISTS "authenticated owner can update sleep_sessions" ON sleep_sessions;
DROP POLICY IF EXISTS "authenticated owner can delete sleep_sessions" ON sleep_sessions;

CREATE POLICY "authenticated owner can select sleep_sessions"
  ON sleep_sessions FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "authenticated owner can insert sleep_sessions"
  ON sleep_sessions FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "authenticated owner can update sleep_sessions"
  ON sleep_sessions FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "authenticated owner can delete sleep_sessions"
  ON sleep_sessions FOR DELETE TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "anon can select settings" ON settings;
DROP POLICY IF EXISTS "anon can insert settings" ON settings;
DROP POLICY IF EXISTS "anon can update settings" ON settings;
DROP POLICY IF EXISTS "anon can delete settings" ON settings;

DROP POLICY IF EXISTS "authenticated owner can select settings" ON settings;
DROP POLICY IF EXISTS "authenticated owner can insert settings" ON settings;
DROP POLICY IF EXISTS "authenticated owner can update settings" ON settings;
DROP POLICY IF EXISTS "authenticated owner can delete settings" ON settings;

CREATE POLICY "authenticated owner can select settings"
  ON settings FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "authenticated owner can insert settings"
  ON settings FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "authenticated owner can update settings"
  ON settings FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "authenticated owner can delete settings"
  ON settings FOR DELETE TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "anon can select food_master" ON food_master;
DROP POLICY IF EXISTS "anon can insert food_master" ON food_master;
DROP POLICY IF EXISTS "anon can update food_master" ON food_master;
DROP POLICY IF EXISTS "anon can delete food_master" ON food_master;

DROP POLICY IF EXISTS "authenticated owner can select food_master" ON food_master;
DROP POLICY IF EXISTS "authenticated owner can insert food_master" ON food_master;
DROP POLICY IF EXISTS "authenticated owner can update food_master" ON food_master;
DROP POLICY IF EXISTS "authenticated owner can delete food_master" ON food_master;

CREATE POLICY "authenticated owner can select food_master"
  ON food_master FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "authenticated owner can insert food_master"
  ON food_master FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "authenticated owner can update food_master"
  ON food_master FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "authenticated owner can delete food_master"
  ON food_master FOR DELETE TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "anon can select menu_master" ON menu_master;
DROP POLICY IF EXISTS "anon can insert menu_master" ON menu_master;
DROP POLICY IF EXISTS "anon can update menu_master" ON menu_master;
DROP POLICY IF EXISTS "anon can delete menu_master" ON menu_master;

DROP POLICY IF EXISTS "authenticated owner can select menu_master" ON menu_master;
DROP POLICY IF EXISTS "authenticated owner can insert menu_master" ON menu_master;
DROP POLICY IF EXISTS "authenticated owner can update menu_master" ON menu_master;
DROP POLICY IF EXISTS "authenticated owner can delete menu_master" ON menu_master;

CREATE POLICY "authenticated owner can select menu_master"
  ON menu_master FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "authenticated owner can insert menu_master"
  ON menu_master FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "authenticated owner can update menu_master"
  ON menu_master FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "authenticated owner can delete menu_master"
  ON menu_master FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ── Owner-aware sleep projection ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION sync_sleep_hours_to_daily_logs()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE daily_logs
    SET sleep_hours = NULL
    WHERE log_date = OLD.wake_date
      AND user_id = OLD.user_id;
    RETURN OLD;
  ELSE
    UPDATE daily_logs
    SET sleep_hours = ROUND(
      EXTRACT(EPOCH FROM (NEW.wake_at - NEW.bed_at)) / 3600.0,
      1
    )::NUMERIC
    WHERE log_date = NEW.wake_date
      AND user_id = NEW.user_id;
    RETURN NEW;
  END IF;
END;
$$;

-- ── Owner-aware daily log RPC ───────────────────────────────────────────────

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
    sleep_hours        = CASE WHEN p_fields ? 'sleep_hours'
                              THEN (p_fields->>'sleep_hours')::NUMERIC
                              ELSE sleep_hours        END,
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
                              ELSE leg_flag           END,
    last_meal_end_time = CASE WHEN p_fields ? 'last_meal_end_time'
                              THEN (p_fields->>'last_meal_end_time')::TIME
                              ELSE last_meal_end_time END,
    step_count         = CASE WHEN p_fields ? 'step_count'
                              THEN (p_fields->>'step_count')::INTEGER
                              ELSE step_count         END
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
    sleep_hours, had_bowel_movement,
    training_type, work_mode, leg_flag,
    last_meal_end_time,
    step_count
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
    (p_fields->>'sleep_hours')::NUMERIC,
    (p_fields->>'had_bowel_movement')::BOOLEAN,
    p_fields->>'training_type',
    p_fields->>'work_mode',
    (p_fields->>'leg_flag')::BOOLEAN,
    (p_fields->>'last_meal_end_time')::TIME,
    (p_fields->>'step_count')::INTEGER
  );
END;
$$;

COMMENT ON FUNCTION save_daily_log_partial(DATE, JSONB) IS
  'Authenticated owner-scoped daily log partial update/insert. Existing rows match log_date + auth.uid(); new rows set user_id = auth.uid().';
