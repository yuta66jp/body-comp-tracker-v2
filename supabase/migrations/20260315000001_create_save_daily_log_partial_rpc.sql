-- save_daily_log_partial: 部分更新対応の atomic upsert RPC
--
-- 目的:
--   saveDailyLog の read-then-write (select → insert/update 分岐) を廃止し、
--   1 回の DB 呼び出しで insert-or-partial-update を完結させる。
--
-- 部分更新の意味論:
--   p_fields JSONB のキー存在で 3 状態を表現する。
--   - キーなし          : 未更新（既存値を保持）
--   - キーあり, 値 null : 明示クリア（null を書き込む）
--   - キーあり, 値あり  : 上書き
--
--   JSONB の `?` 演算子がキー存在チェック、`->>'col'` が値取得（NULL if absent）。
--   これにより undefined フィールドを既存値に保持する partial update が原子的に実現される。
--
-- 新規レコードのデフォルト値:
--   NOT NULL DEFAULT FALSE の boolean 列 (is_cheat_day 等) は、
--   INSERT 側で COALESCE(..., FALSE) を適用することで DB DEFAULT と整合させる。
--   nullable 列はキーなしの場合 NULL が適用される（DB スキーマのデフォルト値）。
--
-- training_type / leg_flag:
--   leg_flag の導出は TypeScript 側 (deriveLegFlag) で完結する。
--   RPC は両フィールドをそのまま受け取り、ON CONFLICT 側でも個別に CASE 処理する。

CREATE OR REPLACE FUNCTION save_daily_log_partial(
  p_log_date DATE,
  p_fields   JSONB
) RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO daily_logs (
    log_date,
    weight, calories, protein, fat, carbs, note,
    is_cheat_day, is_refeed_day, is_eating_out, is_poor_sleep,
    sleep_hours, had_bowel_movement,
    training_type, work_mode, leg_flag
  ) VALUES (
    p_log_date,
    -- nullable 列: キーなし → NULL (DB DEFAULT), キーあり → その値
    (p_fields->>'weight')::NUMERIC,
    (p_fields->>'calories')::NUMERIC,
    (p_fields->>'protein')::NUMERIC,
    (p_fields->>'fat')::NUMERIC,
    (p_fields->>'carbs')::NUMERIC,
    p_fields->>'note',
    -- NOT NULL DEFAULT FALSE 列: キーなし → FALSE, キーあり → その値
    COALESCE((p_fields->>'is_cheat_day')::BOOLEAN,  FALSE),
    COALESCE((p_fields->>'is_refeed_day')::BOOLEAN, FALSE),
    COALESCE((p_fields->>'is_eating_out')::BOOLEAN, FALSE),
    COALESCE((p_fields->>'is_poor_sleep')::BOOLEAN, FALSE),
    -- nullable 列 (続き)
    (p_fields->>'sleep_hours')::NUMERIC,
    (p_fields->>'had_bowel_movement')::BOOLEAN,
    p_fields->>'training_type',
    p_fields->>'work_mode',
    (p_fields->>'leg_flag')::BOOLEAN
  )
  ON CONFLICT (log_date) DO UPDATE SET
    -- CASE WHEN キー存在 THEN 新値 ELSE 既存値 END で partial update を実現
    weight             = CASE WHEN p_fields ? 'weight'
                              THEN (p_fields->>'weight')::NUMERIC
                              ELSE daily_logs.weight             END,
    calories           = CASE WHEN p_fields ? 'calories'
                              THEN (p_fields->>'calories')::NUMERIC
                              ELSE daily_logs.calories           END,
    protein            = CASE WHEN p_fields ? 'protein'
                              THEN (p_fields->>'protein')::NUMERIC
                              ELSE daily_logs.protein            END,
    fat                = CASE WHEN p_fields ? 'fat'
                              THEN (p_fields->>'fat')::NUMERIC
                              ELSE daily_logs.fat                END,
    carbs              = CASE WHEN p_fields ? 'carbs'
                              THEN (p_fields->>'carbs')::NUMERIC
                              ELSE daily_logs.carbs              END,
    note               = CASE WHEN p_fields ? 'note'
                              THEN p_fields->>'note'
                              ELSE daily_logs.note               END,
    is_cheat_day       = CASE WHEN p_fields ? 'is_cheat_day'
                              THEN (p_fields->>'is_cheat_day')::BOOLEAN
                              ELSE daily_logs.is_cheat_day       END,
    is_refeed_day      = CASE WHEN p_fields ? 'is_refeed_day'
                              THEN (p_fields->>'is_refeed_day')::BOOLEAN
                              ELSE daily_logs.is_refeed_day      END,
    is_eating_out      = CASE WHEN p_fields ? 'is_eating_out'
                              THEN (p_fields->>'is_eating_out')::BOOLEAN
                              ELSE daily_logs.is_eating_out      END,
    is_poor_sleep      = CASE WHEN p_fields ? 'is_poor_sleep'
                              THEN (p_fields->>'is_poor_sleep')::BOOLEAN
                              ELSE daily_logs.is_poor_sleep      END,
    sleep_hours        = CASE WHEN p_fields ? 'sleep_hours'
                              THEN (p_fields->>'sleep_hours')::NUMERIC
                              ELSE daily_logs.sleep_hours        END,
    had_bowel_movement = CASE WHEN p_fields ? 'had_bowel_movement'
                              THEN (p_fields->>'had_bowel_movement')::BOOLEAN
                              ELSE daily_logs.had_bowel_movement END,
    training_type      = CASE WHEN p_fields ? 'training_type'
                              THEN p_fields->>'training_type'
                              ELSE daily_logs.training_type      END,
    work_mode          = CASE WHEN p_fields ? 'work_mode'
                              THEN p_fields->>'work_mode'
                              ELSE daily_logs.work_mode          END,
    leg_flag           = CASE WHEN p_fields ? 'leg_flag'
                              THEN (p_fields->>'leg_flag')::BOOLEAN
                              ELSE daily_logs.leg_flag           END;
END;
$$;

COMMENT ON FUNCTION save_daily_log_partial(DATE, JSONB) IS
  '日次ログの partial upsert。p_fields の JSONB キー存在で
   未更新(キーなし) / 明示クリア(キーあり+null) / 上書き(キーあり+値) を表現する。';
