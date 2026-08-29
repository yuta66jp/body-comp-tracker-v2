-- #741: 既存 settings / career_logs / daily_logs を seasons へ移行する
--
-- 安全方針:
--   - legacy career_logs は owner が 1 user に一意に決まる場合だけ移行する
--   - owner 候補が 0 / 複数なら誤帰属させず migration を停止する
--   - career_logs の同一 season に複数 target_date があれば停止する
--   - current settings が新 season 必須項目を満たさない場合は settings を温存し、
--     active season を推測作成しない
--   - INSERT は既存 key を確認して行い、再実行時は no-op とする

DO $$
DECLARE
  v_owner_count INTEGER;
  v_owner_id UUID;
  v_current RECORD;
  v_overrides JSONB;
  v_start_date DATE;
  v_target_date DATE;
BEGIN
  -- settings / daily_logs に実在する owner 候補を数える。
  SELECT COUNT(*), MIN(user_id::TEXT)::UUID
    INTO v_owner_count, v_owner_id
  FROM (
    SELECT DISTINCT user_id FROM settings WHERE user_id IS NOT NULL
    UNION
    SELECT DISTINCT user_id FROM daily_logs WHERE user_id IS NOT NULL
  ) AS owners;

  IF EXISTS (SELECT 1 FROM career_logs) AND v_owner_count <> 1 THEN
    RAISE EXCEPTION
      'season_backfill_ambiguous_career_owner: expected 1 owner, found %',
      v_owner_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM career_logs
    GROUP BY season
    HAVING COUNT(DISTINCT target_date) <> 1
  ) THEN
    RAISE EXCEPTION
      'season_backfill_inconsistent_target_date: career_logs season has multiple target dates';
  END IF;

  IF EXISTS (SELECT 1 FROM career_logs) THEN
    UPDATE career_logs
       SET user_id = v_owner_id
     WHERE user_id IS NULL;

    -- career_logs は大会 prep の過去履歴として導入されたため Cut として移行する。
    -- target_weight は旧 schema に存在せず、安全に復元できないため NULL のまま保持する。
    INSERT INTO seasons (
      user_id,
      name,
      phase,
      start_date,
      start_weight,
      target_date,
      target_weight,
      status,
      end_date,
      end_weight
    )
    SELECT
      grouped.user_id,
      grouped.season,
      'Cut',
      grouped.start_date,
      first_log.weight,
      grouped.target_date,
      NULL,
      'completed',
      grouped.end_date,
      last_log.weight
    FROM (
      SELECT
        user_id,
        season,
        MIN(log_date) AS start_date,
        MAX(log_date) AS end_date,
        MIN(target_date) AS target_date
      FROM career_logs
      GROUP BY user_id, season
    ) AS grouped
    JOIN LATERAL (
      SELECT weight
      FROM career_logs AS c
      WHERE c.user_id = grouped.user_id
        AND c.season = grouped.season
      ORDER BY c.log_date ASC, c.id ASC
      LIMIT 1
    ) AS first_log ON TRUE
    JOIN LATERAL (
      SELECT weight
      FROM career_logs AS c
      WHERE c.user_id = grouped.user_id
        AND c.season = grouped.season
      ORDER BY c.log_date DESC, c.id DESC
      LIMIT 1
    ) AS last_log ON TRUE
    WHERE NOT EXISTS (
      SELECT 1
      FROM seasons AS existing
      WHERE existing.user_id = grouped.user_id
        AND existing.name = grouped.season
        AND existing.start_date = grouped.start_date
    );

    UPDATE career_logs AS c
       SET season_id = s.id
      FROM seasons AS s
     WHERE s.user_id = c.user_id
       AND s.name = c.season
       AND s.phase = 'Cut'
       AND s.status = 'completed'
       AND c.log_date BETWEEN s.start_date AND s.end_date
       AND c.season_id IS NULL;
  END IF;

  -- 現在 settings は user ごとに pivot し、必須値が揃う場合だけ active season 化する。
  FOR v_current IN
    SELECT
      user_id,
      MAX(value_str) FILTER (WHERE key = 'current_season') AS season_name,
      MAX(value_str) FILTER (WHERE key = 'current_phase') AS phase,
      MAX(value_str) FILTER (WHERE key = 'contest_date') AS target_date,
      MAX(value_num) FILTER (WHERE key = 'goal_weight') AS target_weight,
      MAX(value_str) FILTER (WHERE key = 'monthly_plan_start_month') AS plan_start_month,
      MAX(value_num) FILTER (WHERE key = 'monthly_plan_start_weight') AS plan_start_weight,
      MAX(value_str) FILTER (WHERE key = 'monthly_plan_overrides') AS plan_overrides
    FROM settings
    WHERE user_id IS NOT NULL
    GROUP BY user_id
  LOOP
    IF v_current.season_name IS NULL
       OR BTRIM(v_current.season_name) = ''
       OR v_current.phase NOT IN ('Cut', 'Bulk')
       OR v_current.target_date IS NULL
       OR v_current.target_date !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
       OR v_current.target_weight IS NULL
       OR v_current.target_weight < 20
       OR v_current.target_weight > 200
       OR v_current.plan_start_month IS NULL
       OR v_current.plan_start_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
       OR v_current.plan_start_weight IS NULL
       OR v_current.plan_start_weight <= 0
       OR v_current.plan_start_weight > 300
    THEN
      RAISE NOTICE
        'season_backfill_skipped_incomplete_current_settings for user %',
        v_current.user_id;
      CONTINUE;
    END IF;

    BEGIN
      v_start_date := (v_current.plan_start_month || '-01')::DATE;
      v_target_date := v_current.target_date::DATE;
    EXCEPTION
      WHEN invalid_datetime_format OR datetime_field_overflow THEN
        RAISE NOTICE
          'season_backfill_skipped_invalid_current_dates for user %',
          v_current.user_id;
        CONTINUE;
    END;

    IF v_target_date < v_start_date THEN
      RAISE NOTICE
        'season_backfill_skipped_target_before_start for user %',
        v_current.user_id;
      CONTINUE;
    END IF;

    v_overrides := '[]'::JSONB;
    IF v_current.plan_overrides IS NOT NULL AND BTRIM(v_current.plan_overrides) <> '' THEN
      BEGIN
        v_overrides := v_current.plan_overrides::JSONB;
        IF JSONB_TYPEOF(v_overrides) <> 'array' THEN
          RAISE EXCEPTION 'not_array';
        END IF;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE EXCEPTION
            'season_backfill_invalid_monthly_plan_overrides for user %',
            v_current.user_id;
      END;
    END IF;

    INSERT INTO seasons (
      user_id,
      name,
      phase,
      start_date,
      start_weight,
      target_date,
      target_weight,
      status,
      monthly_plan_start_month,
      monthly_plan_start_weight,
      monthly_plan_overrides
    )
    SELECT
      v_current.user_id,
      v_current.season_name,
      v_current.phase,
      v_start_date,
      v_current.plan_start_weight,
      v_target_date,
      v_current.target_weight,
      'active',
      v_current.plan_start_month,
      v_current.plan_start_weight,
      v_overrides
    WHERE NOT EXISTS (
      SELECT 1 FROM seasons AS existing
      WHERE existing.user_id = v_current.user_id
        AND existing.status = 'active'
    );
  END LOOP;

  -- 既存 daily_logs を期間に基づいて backfill。該当 season がなければ NULL のまま。
  UPDATE daily_logs AS d
     SET season_id = resolve_season_id(d.user_id, d.log_date)
   WHERE d.user_id IS NOT NULL
     AND d.season_id IS DISTINCT FROM resolve_season_id(d.user_id, d.log_date);

  IF EXISTS (SELECT 1 FROM career_logs WHERE user_id IS NULL OR season_id IS NULL) THEN
    RAISE EXCEPTION 'season_backfill_unresolved_career_logs';
  END IF;
END
$$;

-- owner backfill 成功後に、legacy global unique を owner-scoped unique へ切り替える。
-- backfill が失敗した場合は旧制約を維持し、部分移行状態で重複を許容しない。
ALTER TABLE career_logs
  DROP CONSTRAINT IF EXISTS career_logs_log_date_season_key;

CREATE UNIQUE INDEX IF NOT EXISTS career_logs_user_date_season_idx
  ON career_logs(user_id, log_date, season);

-- migration 後の career_logs は必ず owner / season を持つ。
ALTER TABLE career_logs
  ALTER COLUMN user_id SET NOT NULL,
  ALTER COLUMN season_id SET NOT NULL;

-- owner backfill が完了してから読み取りを user-scoped に切り替える。
-- backfill が失敗した場合は、この migration 全体が rollback されて旧 policy が維持される。
DROP POLICY IF EXISTS "anon can read career_logs" ON career_logs;
DROP POLICY IF EXISTS "authenticated can read career_logs" ON career_logs;
DROP POLICY IF EXISTS "authenticated owner can read career_logs" ON career_logs;

CREATE POLICY "authenticated owner can read career_logs"
  ON career_logs FOR SELECT TO authenticated USING (user_id = auth.uid());
