-- #743: 月次目標計画を season 単位で編集し、終了時に snapshot を固定する。

ALTER TABLE public.seasons
  ADD COLUMN IF NOT EXISTS monthly_plan_snapshot JSONB;

DO $$
BEGIN
  ALTER TABLE public.seasons
    ADD CONSTRAINT seasons_monthly_plan_snapshot_check CHECK (
      monthly_plan_snapshot IS NULL
      OR JSONB_TYPEOF(monthly_plan_snapshot) = 'array'
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

COMMENT ON COLUMN public.seasons.monthly_plan_snapshot IS
  '終了時に固定した月次計画。target/source/actual/required delta を保持し再計算しない。';

CREATE OR REPLACE FUNCTION public.enforce_season_lifecycle_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.status = 'completed' THEN
    RAISE EXCEPTION 'completed_season_read_only';
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.name IS DISTINCT FROM OLD.name
     OR NEW.phase IS DISTINCT FROM OLD.phase
     OR NEW.start_date IS DISTINCT FROM OLD.start_date
     OR NEW.start_weight IS DISTINCT FROM OLD.start_weight THEN
    RAISE EXCEPTION 'season_identity_immutable';
  END IF;

  -- lifecycle管理列はSECURITY DEFINER RPC（owner実行）だけが変更できる。
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

CREATE OR REPLACE FUNCTION public.normalize_season_plan_overrides(
  p_overrides JSONB,
  p_plan_start_month TEXT,
  p_target_date DATE
) RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_item JSONB;
  v_month TEXT;
  v_target_weight NUMERIC;
  v_seen_months TEXT[] := ARRAY[]::TEXT[];
  v_target_month TEXT := TO_CHAR(p_target_date, 'YYYY-MM');
  v_result JSONB := '[]'::JSONB;
BEGIN
  IF p_plan_start_month IS NULL
     OR p_plan_start_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
     OR p_target_date IS NULL
     OR JSONB_TYPEOF(COALESCE(p_overrides, '[]'::JSONB)) <> 'array' THEN
    RAISE EXCEPTION 'season_plan_overrides_invalid';
  END IF;

  FOR v_item IN SELECT value FROM JSONB_ARRAY_ELEMENTS(COALESCE(p_overrides, '[]'::JSONB))
  LOOP
    IF JSONB_TYPEOF(v_item) <> 'object'
       OR JSONB_TYPEOF(v_item->'month') <> 'string'
       OR JSONB_TYPEOF(v_item->'targetWeight') <> 'number' THEN
      RAISE EXCEPTION 'season_plan_overrides_invalid';
    END IF;

    v_month := v_item->>'month';
    v_target_weight := (v_item->>'targetWeight')::NUMERIC;
    IF v_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
       OR v_target_weight < 20
       OR v_target_weight > 200
       OR v_month = ANY(v_seen_months) THEN
      RAISE EXCEPTION 'season_plan_overrides_invalid';
    END IF;
    v_seen_months := ARRAY_APPEND(v_seen_months, v_month);

    IF v_month >= p_plan_start_month AND v_month < v_target_month THEN
      v_result := v_result || JSONB_BUILD_ARRAY(
        JSONB_BUILD_OBJECT('month', v_month, 'targetWeight', v_target_weight)
      );
    END IF;
  END LOOP;

  RETURN COALESCE(
    (
      SELECT JSONB_AGG(value ORDER BY value->>'month')
      FROM JSONB_ARRAY_ELEMENTS(v_result)
    ),
    '[]'::JSONB
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_season_plan_snapshot(
  p_snapshot JSONB
) RETURNS VOID
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_item JSONB;
  v_month TEXT;
  v_seen_months TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF JSONB_TYPEOF(p_snapshot) <> 'array' OR JSONB_ARRAY_LENGTH(p_snapshot) = 0 THEN
    RAISE EXCEPTION 'season_plan_snapshot_invalid';
  END IF;

  FOR v_item IN SELECT value FROM JSONB_ARRAY_ELEMENTS(p_snapshot)
  LOOP
    IF JSONB_TYPEOF(v_item) <> 'object'
       OR NOT (v_item ?& ARRAY['month', 'targetWeight', 'source', 'requiredDeltaKg', 'actualWeight'])
       OR JSONB_TYPEOF(v_item->'month') <> 'string'
       OR JSONB_TYPEOF(v_item->'targetWeight') <> 'number'
       OR JSONB_TYPEOF(v_item->'source') <> 'string'
       OR JSONB_TYPEOF(v_item->'requiredDeltaKg') <> 'number'
       OR (
         v_item->'actualWeight' IS NOT NULL
         AND JSONB_TYPEOF(v_item->'actualWeight') NOT IN ('number', 'null')
       ) THEN
      RAISE EXCEPTION 'season_plan_snapshot_invalid';
    END IF;

    v_month := v_item->>'month';
    IF v_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
       OR (v_item->>'targetWeight')::NUMERIC <= 0
       OR (v_item->>'targetWeight')::NUMERIC > 300
       OR (
         JSONB_TYPEOF(v_item->'actualWeight') = 'number'
         AND (
           (v_item->>'actualWeight')::NUMERIC <= 0
           OR (v_item->>'actualWeight')::NUMERIC > 300
         )
       )
       OR v_item->>'source' NOT IN ('manual', 'auto_redistributed', 'actual_fixed')
       OR v_month = ANY(v_seen_months) THEN
      RAISE EXCEPTION 'season_plan_snapshot_invalid';
    END IF;
    v_seen_months := ARRAY_APPEND(v_seen_months, v_month);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.normalize_season_plan_overrides(JSONB, TEXT, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_season_plan_snapshot(JSONB) FROM PUBLIC;

-- #742 の旧signatureを閉じ、updated_atとsnapshotを含む競合安全なsignatureへ置き換える。
REVOKE ALL ON FUNCTION public.start_or_switch_season(BIGINT, TEXT, TEXT, DATE, DATE, NUMERIC) FROM authenticated;
REVOKE ALL ON FUNCTION public.end_active_season(BIGINT, DATE) FROM authenticated;
REVOKE ALL ON FUNCTION public.update_active_season_goal(BIGINT, DATE, NUMERIC) FROM authenticated;
DROP FUNCTION public.start_or_switch_season(BIGINT, TEXT, TEXT, DATE, DATE, NUMERIC);
DROP FUNCTION public.end_active_season(BIGINT, DATE);
DROP FUNCTION public.update_active_season_goal(BIGINT, DATE, NUMERIC);

CREATE OR REPLACE FUNCTION public.start_or_switch_season(
  p_expected_active_season_id BIGINT,
  p_expected_active_season_updated_at TIMESTAMPTZ,
  p_name TEXT,
  p_phase TEXT,
  p_start_date DATE,
  p_target_date DATE,
  p_target_weight NUMERIC,
  p_previous_plan_snapshot JSONB
) RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_today DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')::DATE;
  v_active public.seasons%ROWTYPE;
  v_start_weight NUMERIC;
  v_end_weight NUMERIC;
  v_new_season_id BIGINT;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF p_name IS NULL OR BTRIM(p_name) = '' THEN RAISE EXCEPTION 'season_name_required'; END IF;
  IF p_phase NOT IN ('Cut', 'Bulk') THEN RAISE EXCEPTION 'season_phase_invalid'; END IF;
  IF p_start_date IS NULL OR p_start_date > v_today THEN RAISE EXCEPTION 'season_start_date_invalid'; END IF;
  IF p_target_date IS NULL OR p_target_date < p_start_date THEN RAISE EXCEPTION 'season_target_date_invalid'; END IF;
  IF p_target_weight IS NULL OR p_target_weight < 20 OR p_target_weight > 200 THEN
    RAISE EXCEPTION 'season_target_weight_invalid';
  END IF;

  PERFORM PG_ADVISORY_XACT_LOCK(hashtextextended(v_user_id::TEXT, 742));
  SELECT * INTO v_active
  FROM public.seasons
  WHERE user_id = v_user_id AND status = 'active'
  FOR UPDATE;

  IF v_active.id IS DISTINCT FROM p_expected_active_season_id
     OR v_active.updated_at IS DISTINCT FROM p_expected_active_season_updated_at THEN
    RAISE EXCEPTION 'active_season_changed';
  END IF;
  IF v_active.id IS NOT NULL AND p_start_date <= v_active.start_date THEN
    RAISE EXCEPTION 'season_switch_date_invalid';
  END IF;

  SELECT weight INTO v_start_weight
  FROM public.daily_logs
  WHERE user_id = v_user_id AND log_date <= p_start_date AND weight IS NOT NULL
  ORDER BY log_date DESC LIMIT 1;
  IF v_start_weight IS NULL THEN RAISE EXCEPTION 'season_start_weight_missing'; END IF;

  IF v_active.id IS NULL THEN
    IF p_previous_plan_snapshot IS NOT NULL THEN RAISE EXCEPTION 'season_plan_snapshot_invalid'; END IF;
  ELSE
    PERFORM public.validate_season_plan_snapshot(p_previous_plan_snapshot);
    IF p_previous_plan_snapshot->0->>'month' <> v_active.monthly_plan_start_month
       OR p_previous_plan_snapshot->-1->>'month' <> TO_CHAR(v_active.target_date, 'YYYY-MM')
       OR ABS((p_previous_plan_snapshot->-1->>'targetWeight')::NUMERIC - v_active.target_weight) > 0.05 THEN
      RAISE EXCEPTION 'season_plan_snapshot_invalid';
    END IF;
    SELECT weight INTO v_end_weight
    FROM public.daily_logs
    WHERE user_id = v_user_id AND log_date <= p_start_date - 1 AND weight IS NOT NULL
    ORDER BY log_date DESC LIMIT 1;

    UPDATE public.seasons
    SET status = 'completed',
        end_date = p_start_date - 1,
        end_weight = v_end_weight,
        monthly_plan_snapshot = p_previous_plan_snapshot
    WHERE id = v_active.id AND user_id = v_user_id;
  END IF;

  INSERT INTO public.seasons (
    user_id, name, phase, start_date, start_weight, target_date, target_weight,
    status, monthly_plan_start_month, monthly_plan_start_weight,
    monthly_plan_overrides, monthly_plan_snapshot
  ) VALUES (
    v_user_id, BTRIM(p_name), p_phase, p_start_date, v_start_weight,
    p_target_date, p_target_weight, 'active', TO_CHAR(p_start_date, 'YYYY-MM'),
    v_start_weight, '[]'::JSONB, NULL
  ) RETURNING id INTO v_new_season_id;

  UPDATE public.daily_logs AS d
  SET season_id = public.resolve_season_id(d.user_id, d.log_date)
  WHERE d.user_id = v_user_id
    AND d.season_id IS DISTINCT FROM public.resolve_season_id(d.user_id, d.log_date);

  PERFORM public.sync_current_season_settings(
    v_user_id, BTRIM(p_name), p_phase, p_target_date, p_target_weight,
    TO_CHAR(p_start_date, 'YYYY-MM'), v_start_weight, '[]'::JSONB
  );
  RETURN v_new_season_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.end_active_season(
  p_expected_active_season_id BIGINT,
  p_expected_active_season_updated_at TIMESTAMPTZ,
  p_end_date DATE,
  p_plan_snapshot JSONB
) RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_today DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')::DATE;
  v_active public.seasons%ROWTYPE;
  v_end_weight NUMERIC;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF p_end_date IS NULL OR p_end_date > v_today THEN RAISE EXCEPTION 'season_end_date_invalid'; END IF;
  PERFORM PG_ADVISORY_XACT_LOCK(hashtextextended(v_user_id::TEXT, 742));
  SELECT * INTO v_active
  FROM public.seasons
  WHERE user_id = v_user_id AND status = 'active'
  FOR UPDATE;

  IF v_active.id IS DISTINCT FROM p_expected_active_season_id
     OR v_active.updated_at IS DISTINCT FROM p_expected_active_season_updated_at THEN
    RAISE EXCEPTION 'active_season_changed';
  END IF;
  IF v_active.id IS NULL THEN RAISE EXCEPTION 'active_season_not_found'; END IF;
  IF p_end_date < v_active.start_date THEN RAISE EXCEPTION 'season_end_date_invalid'; END IF;
  PERFORM public.validate_season_plan_snapshot(p_plan_snapshot);
  IF p_plan_snapshot->0->>'month' <> v_active.monthly_plan_start_month
     OR p_plan_snapshot->-1->>'month' <> TO_CHAR(v_active.target_date, 'YYYY-MM')
     OR ABS((p_plan_snapshot->-1->>'targetWeight')::NUMERIC - v_active.target_weight) > 0.05 THEN
    RAISE EXCEPTION 'season_plan_snapshot_invalid';
  END IF;

  SELECT weight INTO v_end_weight
  FROM public.daily_logs
  WHERE user_id = v_user_id AND log_date <= p_end_date AND weight IS NOT NULL
  ORDER BY log_date DESC LIMIT 1;

  UPDATE public.seasons
  SET status = 'completed', end_date = p_end_date, end_weight = v_end_weight,
      monthly_plan_snapshot = p_plan_snapshot
  WHERE id = v_active.id AND user_id = v_user_id;

  UPDATE public.daily_logs AS d
  SET season_id = public.resolve_season_id(d.user_id, d.log_date)
  WHERE d.user_id = v_user_id
    AND d.season_id IS DISTINCT FROM public.resolve_season_id(d.user_id, d.log_date);

  PERFORM public.sync_current_season_settings(
    v_user_id, NULL, NULL, NULL, NULL, NULL, NULL, NULL
  );
  RETURN v_active.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_active_season_goal(
  p_expected_active_season_id BIGINT,
  p_expected_active_season_updated_at TIMESTAMPTZ,
  p_target_date DATE,
  p_target_weight NUMERIC
) RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_active public.seasons%ROWTYPE;
  v_overrides JSONB;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF p_target_weight IS NULL OR p_target_weight < 20 OR p_target_weight > 200 THEN
    RAISE EXCEPTION 'season_target_weight_invalid';
  END IF;
  PERFORM PG_ADVISORY_XACT_LOCK(hashtextextended(v_user_id::TEXT, 742));
  SELECT * INTO v_active
  FROM public.seasons
  WHERE user_id = v_user_id AND status = 'active'
  FOR UPDATE;

  IF v_active.id IS DISTINCT FROM p_expected_active_season_id
     OR v_active.updated_at IS DISTINCT FROM p_expected_active_season_updated_at THEN
    RAISE EXCEPTION 'active_season_changed';
  END IF;
  IF v_active.id IS NULL THEN RAISE EXCEPTION 'active_season_not_found'; END IF;
  IF p_target_date IS NULL OR p_target_date < v_active.start_date THEN
    RAISE EXCEPTION 'season_target_date_invalid';
  END IF;

  v_overrides := public.normalize_season_plan_overrides(
    v_active.monthly_plan_overrides,
    v_active.monthly_plan_start_month,
    p_target_date
  );
  UPDATE public.seasons
  SET target_date = p_target_date, target_weight = p_target_weight,
      monthly_plan_overrides = v_overrides
  WHERE id = v_active.id AND user_id = v_user_id;

  PERFORM public.sync_current_season_settings(
    v_user_id, v_active.name, v_active.phase, p_target_date, p_target_weight,
    v_active.monthly_plan_start_month, v_active.monthly_plan_start_weight, v_overrides
  );
  RETURN v_active.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_active_season_plan_overrides(
  p_expected_active_season_id BIGINT,
  p_expected_active_season_updated_at TIMESTAMPTZ,
  p_overrides JSONB,
  p_reset_all BOOLEAN
) RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_active public.seasons%ROWTYPE;
  v_overrides JSONB;
  v_current_past JSONB;
  v_new_past JSONB;
  v_current_month TEXT := TO_CHAR(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM');
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF p_reset_all IS NULL THEN RAISE EXCEPTION 'season_plan_overrides_invalid'; END IF;
  PERFORM PG_ADVISORY_XACT_LOCK(hashtextextended(v_user_id::TEXT, 742));
  SELECT * INTO v_active
  FROM public.seasons
  WHERE user_id = v_user_id AND status = 'active'
  FOR UPDATE;

  IF v_active.id IS DISTINCT FROM p_expected_active_season_id
     OR v_active.updated_at IS DISTINCT FROM p_expected_active_season_updated_at THEN
    RAISE EXCEPTION 'active_season_changed';
  END IF;
  IF v_active.id IS NULL THEN RAISE EXCEPTION 'active_season_not_found'; END IF;

  v_overrides := public.normalize_season_plan_overrides(
    p_overrides, v_active.monthly_plan_start_month, v_active.target_date
  );
  IF p_reset_all AND v_overrides <> '[]'::JSONB THEN
    RAISE EXCEPTION 'season_plan_overrides_invalid';
  END IF;
  SELECT COALESCE(JSONB_AGG(value ORDER BY value->>'month'), '[]'::JSONB)
  INTO v_current_past
  FROM JSONB_ARRAY_ELEMENTS(v_active.monthly_plan_overrides)
  WHERE value->>'month' < v_current_month;
  SELECT COALESCE(JSONB_AGG(value ORDER BY value->>'month'), '[]'::JSONB)
  INTO v_new_past
  FROM JSONB_ARRAY_ELEMENTS(v_overrides)
  WHERE value->>'month' < v_current_month;
  IF NOT p_reset_all AND v_current_past IS DISTINCT FROM v_new_past THEN
    RAISE EXCEPTION 'past_season_plan_override_immutable';
  END IF;

  UPDATE public.seasons
  SET monthly_plan_overrides = v_overrides
  WHERE id = v_active.id AND user_id = v_user_id;
  PERFORM public.sync_current_season_settings(
    v_user_id, v_active.name, v_active.phase, v_active.target_date,
    v_active.target_weight, v_active.monthly_plan_start_month,
    v_active.monthly_plan_start_weight, v_overrides
  );
  RETURN v_active.id;
END;
$$;

REVOKE ALL ON FUNCTION public.start_or_switch_season(BIGINT, TIMESTAMPTZ, TEXT, TEXT, DATE, DATE, NUMERIC, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.end_active_season(BIGINT, TIMESTAMPTZ, DATE, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_active_season_goal(BIGINT, TIMESTAMPTZ, DATE, NUMERIC) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_active_season_plan_overrides(BIGINT, TIMESTAMPTZ, JSONB, BOOLEAN) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.start_or_switch_season(BIGINT, TIMESTAMPTZ, TEXT, TEXT, DATE, DATE, NUMERIC, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.end_active_season(BIGINT, TIMESTAMPTZ, DATE, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_active_season_goal(BIGINT, TIMESTAMPTZ, DATE, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_active_season_plan_overrides(BIGINT, TIMESTAMPTZ, JSONB, BOOLEAN) TO authenticated;

-- authenticatedのseason書き込みはatomicなSECURITY DEFINER RPCだけに限定する。
DROP POLICY IF EXISTS "authenticated owner can insert seasons" ON public.seasons;
DROP POLICY IF EXISTS "authenticated owner can update seasons" ON public.seasons;
DROP POLICY IF EXISTS "authenticated owner can delete seasons" ON public.seasons;
