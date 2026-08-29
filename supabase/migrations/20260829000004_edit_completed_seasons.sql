-- #753: 終了済み season の名称・phase・終了日を専用RPCで安全に訂正する。

CREATE OR REPLACE FUNCTION public.enforce_season_lifecycle_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_completed_edit_allowed BOOLEAN := COALESCE(
    CURRENT_USER = 'postgres'
    AND CURRENT_SETTING('app.completed_season_edit_id', TRUE) = OLD.id::TEXT,
    FALSE
  );
BEGIN
  IF OLD.status = 'completed' THEN
    IF NOT v_completed_edit_allowed THEN
      RAISE EXCEPTION 'completed_season_read_only';
    END IF;

    IF NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.start_date IS DISTINCT FROM OLD.start_date
       OR NEW.start_weight IS DISTINCT FROM OLD.start_weight
       OR NEW.target_date IS DISTINCT FROM OLD.target_date
       OR NEW.target_weight IS DISTINCT FROM OLD.target_weight
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.monthly_plan_start_month IS DISTINCT FROM OLD.monthly_plan_start_month
       OR NEW.monthly_plan_start_weight IS DISTINCT FROM OLD.monthly_plan_start_weight
       OR NEW.monthly_plan_overrides IS DISTINCT FROM OLD.monthly_plan_overrides THEN
      RAISE EXCEPTION 'completed_season_edit_scope_invalid';
    END IF;

    RETURN NEW;
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.name IS DISTINCT FROM OLD.name
     OR NEW.phase IS DISTINCT FROM OLD.phase
     OR NEW.start_date IS DISTINCT FROM OLD.start_date
     OR NEW.start_weight IS DISTINCT FROM OLD.start_weight THEN
    RAISE EXCEPTION 'season_identity_immutable';
  END IF;

  IF CURRENT_USER <> 'postgres'
     AND (
       NEW.target_date IS DISTINCT FROM OLD.target_date
       OR NEW.target_weight IS DISTINCT FROM OLD.target_weight
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.end_date IS DISTINCT FROM OLD.end_date
       OR NEW.end_weight IS DISTINCT FROM OLD.end_weight
       OR NEW.monthly_plan_start_month IS DISTINCT FROM OLD.monthly_plan_start_month
       OR NEW.monthly_plan_start_weight IS DISTINCT FROM OLD.monthly_plan_start_weight
       OR NEW.monthly_plan_overrides IS DISTINCT FROM OLD.monthly_plan_overrides
       OR NEW.monthly_plan_snapshot IS DISTINCT FROM OLD.monthly_plan_snapshot
     ) THEN
    RAISE EXCEPTION 'season_lifecycle_rpc_required';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_season_lifecycle_immutability() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.update_completed_season(
  p_expected_completed_season_id BIGINT,
  p_expected_completed_season_updated_at TIMESTAMPTZ,
  p_name TEXT,
  p_phase TEXT,
  p_end_date DATE
) RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_today DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')::DATE;
  v_season public.seasons%ROWTYPE;
  v_next_start_date DATE;
  v_end_weight NUMERIC;
  v_snapshot JSONB;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF p_name IS NULL OR BTRIM(p_name) = '' OR CHAR_LENGTH(BTRIM(p_name)) > 100 THEN
    RAISE EXCEPTION 'season_name_invalid';
  END IF;
  IF p_phase NOT IN ('Cut', 'Bulk') THEN RAISE EXCEPTION 'season_phase_invalid'; END IF;
  IF p_end_date IS NULL OR p_end_date > v_today THEN
    RAISE EXCEPTION 'completed_season_end_date_invalid';
  END IF;

  PERFORM PG_ADVISORY_XACT_LOCK(hashtextextended(v_user_id::TEXT, 753));

  SELECT * INTO v_season
  FROM public.seasons
  WHERE id = p_expected_completed_season_id
    AND user_id = v_user_id
    AND status = 'completed'
  FOR UPDATE;

  IF v_season.id IS NULL THEN RAISE EXCEPTION 'completed_season_not_found'; END IF;
  IF v_season.updated_at IS DISTINCT FROM p_expected_completed_season_updated_at THEN
    RAISE EXCEPTION 'completed_season_changed';
  END IF;
  IF p_end_date < v_season.start_date THEN
    RAISE EXCEPTION 'completed_season_end_date_invalid';
  END IF;

  SELECT start_date INTO v_next_start_date
  FROM public.seasons
  WHERE user_id = v_user_id
    AND start_date > v_season.start_date
  ORDER BY start_date, id
  LIMIT 1;

  IF v_next_start_date IS NOT NULL AND p_end_date >= v_next_start_date THEN
    RAISE EXCEPTION 'completed_season_period_overlap';
  END IF;

  IF p_end_date < v_season.end_date
     AND EXISTS (
       SELECT 1
       FROM public.career_logs
       WHERE user_id = v_user_id
         AND season_id = v_season.id
         AND log_date > p_end_date
         AND log_date <= v_season.end_date
     ) THEN
    RAISE EXCEPTION 'completed_season_career_log_out_of_range';
  END IF;

  SELECT weight INTO v_end_weight
  FROM public.daily_logs
  WHERE user_id = v_user_id
    AND log_date <= p_end_date
    AND weight IS NOT NULL
  ORDER BY log_date DESC
  LIMIT 1;

  IF v_season.monthly_plan_snapshot IS NULL THEN
    v_snapshot := NULL;
  ELSE
    SELECT JSONB_AGG(
      JSONB_SET(
        entry.value,
        '{actualWeight}',
        COALESCE(
          (
            SELECT TO_JSONB(d.weight)
            FROM public.daily_logs AS d
            WHERE d.user_id = v_user_id
              AND d.weight IS NOT NULL
              AND d.log_date >= v_season.start_date
              AND d.log_date <= p_end_date
              AND d.log_date >= TO_DATE(entry.value->>'month' || '-01', 'YYYY-MM-DD')
              AND d.log_date < (TO_DATE(entry.value->>'month' || '-01', 'YYYY-MM-DD') + INTERVAL '1 month')::DATE
            ORDER BY d.log_date DESC
            LIMIT 1
          ),
          'null'::JSONB
        ),
        TRUE
      )
      ORDER BY entry.ordinality
    ) INTO v_snapshot
    FROM JSONB_ARRAY_ELEMENTS(v_season.monthly_plan_snapshot)
      WITH ORDINALITY AS entry(value, ordinality);
  END IF;

  PERFORM SET_CONFIG('app.completed_season_edit_id', v_season.id::TEXT, TRUE);
  UPDATE public.seasons
  SET name = BTRIM(p_name),
      phase = p_phase,
      end_date = p_end_date,
      end_weight = v_end_weight,
      monthly_plan_snapshot = v_snapshot
  WHERE id = v_season.id
    AND user_id = v_user_id;
  PERFORM SET_CONFIG('app.completed_season_edit_id', '', TRUE);

  UPDATE public.daily_logs AS d
  SET season_id = public.resolve_season_id(d.user_id, d.log_date)
  WHERE d.user_id = v_user_id
    AND d.season_id IS DISTINCT FROM public.resolve_season_id(d.user_id, d.log_date);

  RETURN v_season.id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_completed_season(BIGINT, TIMESTAMPTZ, TEXT, TEXT, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_completed_season(BIGINT, TIMESTAMPTZ, TEXT, TEXT, DATE) TO authenticated;
