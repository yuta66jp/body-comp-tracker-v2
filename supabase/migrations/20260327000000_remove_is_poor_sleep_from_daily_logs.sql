-- is_poor_sleep カラムを daily_logs から削除する
--
-- 削除理由:
--   睡眠評価は sleep_hours（睡眠時間・数値）に移行済み。
--   is_poor_sleep は UI 入力廃止済みであり、DB カラムとして残す理由がなくなった。
--   NOT NULL DEFAULT FALSE の設計上、未入力日も false が保存されるため
--   「睡眠不良なし」と「未記録」の区別ができない問題があった。
--   sleep_hours による定量的な睡眠評価で代替できる。
--
-- 影響:
--   save_daily_log_partial 関数からも is_poor_sleep を除去する（再定義）。

ALTER TABLE daily_logs DROP COLUMN IF EXISTS is_poor_sleep;

-- save_daily_log_partial を is_poor_sleep なしで再定義する
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
                              ELSE leg_flag           END
  WHERE log_date = p_log_date;

  -- 既存行が更新できたなら終了（INSERT 側には一切触れない）
  IF FOUND THEN
    RETURN;
  END IF;

  -- ── Step 2: 新規行の場合は weight 必須チェック ───────────────────────────
  -- INSERT 側の NOT NULL 制約に落とすのではなく、アプリが解釈できるエラーを返す
  IF NOT (p_fields ? 'weight') OR (p_fields->>'weight') IS NULL THEN
    RAISE EXCEPTION 'new_log_requires_weight';
  END IF;

  -- ── Step 3: 新規 INSERT ──────────────────────────────────────────────────
  INSERT INTO daily_logs (
    log_date,
    weight, calories, protein, fat, carbs, note,
    is_cheat_day, is_refeed_day, is_eating_out, is_travel_day,
    sleep_hours, had_bowel_movement,
    training_type, work_mode, leg_flag
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
    (p_fields->>'leg_flag')::BOOLEAN
  );
END;
$$;

COMMENT ON FUNCTION save_daily_log_partial(DATE, JSONB) IS
  '日次ログの partial update/insert。
   既存行: UPDATE のみ実行（INSERT 側の NOT NULL 制約に触れない）。
   新規行: weight 必須チェック後に INSERT。
   p_fields の JSONB キー存在で 未更新(キーなし) / 明示クリア(キーあり+null) / 上書き(キーあり+値) を表現。
   weight なしで新規作成を試みた場合は new_log_requires_weight 例外を発生させる。';
