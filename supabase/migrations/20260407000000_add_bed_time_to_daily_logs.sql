-- daily_logs に就寝時刻 (bed_time) を追加する
--
-- 目的:
--   bed_time + weigh_in_time の差分から推定睡眠時間 (sleep_hours) を算出するための観測項目。
--   算出ロジックはフロントエンド保存経路 (saveDailyLog.ts) に集約し、DB 側では純粋なカラム追加のみ行う。
--
-- 設計:
--   - TIME 型・nullable（未記録を null で表現する）
--   - 部分更新の意味論は既存カラムと同じ:
--       キーなし          = 未更新（既存値保持）
--       キーあり + null   = 明示クリア
--       キーあり + 値あり = 上書き
--
-- sleep_hours との関係:
--   - bed_time + weigh_in_time が両方揃った保存時 → saveDailyLog が sleep_hours を算出して同時保存
--   - bed_time を明示クリア (null) した場合 → saveDailyLog が sleep_hours も null にして同時保存
--   - bed_time のみで weigh_in_time が不明な場合 → sleep_hours は更新しない
--
-- 後続:
--   - #502 で UI (MealLogger) に bed_time 入力欄を追加
--   - #503 で CLAUDE.md / README のドキュメント更新

ALTER TABLE daily_logs
  ADD COLUMN IF NOT EXISTS bed_time TIME;

-- save_daily_log_partial RPC に bed_time を追加する
--
-- 変更内容:
--   - UPDATE 節に bed_time の CASE 句を追加
--   - INSERT 節に bed_time カラムを追加（nullable のため COALESCE 不要）
--
-- 部分更新の意味論（既存と同じ）:
--   - キーなし          : 未更新（既存値を保持）
--   - キーあり, 値 null : 明示クリア
--   - キーあり, 値あり  : 上書き

CREATE OR REPLACE FUNCTION save_daily_log_partial(
  p_log_date DATE,
  p_fields   JSONB
) RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  -- ── Step 1: 既存行への partial update を試みる ───────────────────────────
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
    weigh_in_time      = CASE WHEN p_fields ? 'weigh_in_time'
                              THEN (p_fields->>'weigh_in_time')::TIME
                              ELSE weigh_in_time      END,
    step_count         = CASE WHEN p_fields ? 'step_count'
                              THEN (p_fields->>'step_count')::INTEGER
                              ELSE step_count         END,
    bed_time           = CASE WHEN p_fields ? 'bed_time'
                              THEN (p_fields->>'bed_time')::TIME
                              ELSE bed_time           END
  WHERE log_date = p_log_date;

  -- 既存行が更新できたなら終了（INSERT 側には一切触れない）
  IF FOUND THEN
    RETURN;
  END IF;

  -- ── Step 2: 新規行の場合は weight 必須チェック ───────────────────────────
  IF NOT (p_fields ? 'weight') OR (p_fields->>'weight') IS NULL THEN
    RAISE EXCEPTION 'new_log_requires_weight';
  END IF;

  -- ── Step 3: 新規 INSERT ──────────────────────────────────────────────────
  INSERT INTO daily_logs (
    log_date,
    weight, calories, protein, fat, carbs, note,
    is_cheat_day, is_refeed_day, is_eating_out, is_travel_day,
    sleep_hours, had_bowel_movement,
    training_type, work_mode, leg_flag,
    last_meal_end_time, weigh_in_time,
    step_count,
    bed_time
  ) VALUES (
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
    (p_fields->>'sleep_hours')::NUMERIC,
    (p_fields->>'had_bowel_movement')::BOOLEAN,
    p_fields->>'training_type',
    p_fields->>'work_mode',
    (p_fields->>'leg_flag')::BOOLEAN,
    (p_fields->>'last_meal_end_time')::TIME,
    (p_fields->>'weigh_in_time')::TIME,
    (p_fields->>'step_count')::INTEGER,
    (p_fields->>'bed_time')::TIME
  );
END;
$$;

COMMENT ON FUNCTION save_daily_log_partial(DATE, JSONB) IS
  '日次ログの partial update/insert。
   既存行: UPDATE のみ実行（INSERT 側の NOT NULL 制約に触れない）。
   新規行: weight 必須チェック後に INSERT。
   p_fields の JSONB キー存在で 未更新(キーなし) / 明示クリア(キーあり+null) / 上書き(キーあり+値) を表現。
   weight なしで新規作成を試みた場合は new_log_requires_weight 例外を発生させる。
   is_poor_sleep は 20260327 で廃止済み。このカラムはカラム・RPC ともに参照しない。
   bed_time は 20260407 で追加。sleep_hours の算出は saveDailyLog.ts (フロントエンド) で行う。';
