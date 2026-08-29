-- #742: season の開始・終了・切り替えを atomic に行う lifecycle RPC
--
-- 方針:
--   - auth.uid() 単位の transaction advisory lock で二重送信を直列化する
--   - 開始・終了体重は daily_logs から RPC 内で再解決する
--   - seasons / daily_logs.season_id / legacy settings mirror を同一 transaction で更新する
--   - 期限超過だけでは状態を変更しない

CREATE OR REPLACE FUNCTION public.sync_current_season_settings(
  p_user_id UUID,
  p_name TEXT,
  p_phase TEXT,
  p_target_date DATE,
  p_target_weight NUMERIC,
  p_plan_start_month TEXT,
  p_plan_start_weight NUMERIC,
  p_plan_overrides JSONB
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_affected INTEGER;
BEGIN
  INSERT INTO public.settings AS current_settings (
    key,
    value_num,
    value_str,
    user_id
  ) VALUES
    ('current_season', NULL, p_name, p_user_id),
    ('current_phase', NULL, p_phase, p_user_id),
    ('contest_date', NULL, p_target_date::TEXT, p_user_id),
    ('goal_weight', p_target_weight, NULL, p_user_id),
    ('monthly_plan_start_month', NULL, p_plan_start_month, p_user_id),
    ('monthly_plan_start_weight', p_plan_start_weight, NULL, p_user_id),
    (
      'monthly_plan_overrides',
      NULL,
      CASE WHEN p_name IS NULL THEN NULL ELSE COALESCE(p_plan_overrides, '[]'::JSONB)::TEXT END,
      p_user_id
    )
  ON CONFLICT (key) DO UPDATE
    SET value_num = EXCLUDED.value_num,
        value_str = EXCLUDED.value_str,
        user_id = EXCLUDED.user_id
  WHERE current_settings.user_id IS NULL
     OR current_settings.user_id = EXCLUDED.user_id;

  GET DIAGNOSTICS v_affected = ROW_COUNT;
  IF v_affected <> 7 THEN
    RAISE EXCEPTION 'season_settings_owner_conflict';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_current_season_settings(
  UUID, TEXT, TEXT, DATE, NUMERIC, TEXT, NUMERIC, JSONB
) FROM PUBLIC;

-- season の識別情報と完了済み履歴は通常の UPDATE で書き換えない。
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

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_season_lifecycle_immutability ON public.seasons;
CREATE TRIGGER enforce_season_lifecycle_immutability
BEFORE UPDATE ON public.seasons
FOR EACH ROW
EXECUTE FUNCTION public.enforce_season_lifecycle_immutability();

REVOKE ALL ON FUNCTION public.enforce_season_lifecycle_immutability() FROM PUBLIC;

-- 開発中の旧signatureが残っていても、権限のないoverloadを残さない。
DROP FUNCTION IF EXISTS public.start_or_switch_season(TEXT, TEXT, DATE, DATE, NUMERIC);
DROP FUNCTION IF EXISTS public.end_active_season(DATE);
DROP FUNCTION IF EXISTS public.update_active_season_goal(DATE, NUMERIC);

CREATE OR REPLACE FUNCTION public.start_or_switch_season(
  p_expected_active_season_id BIGINT,
  p_name TEXT,
  p_phase TEXT,
  p_start_date DATE,
  p_target_date DATE,
  p_target_weight NUMERIC
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
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'auth_required';
  END IF;
  IF p_name IS NULL OR BTRIM(p_name) = '' THEN
    RAISE EXCEPTION 'season_name_required';
  END IF;
  IF p_phase NOT IN ('Cut', 'Bulk') THEN
    RAISE EXCEPTION 'season_phase_invalid';
  END IF;
  IF p_start_date IS NULL OR p_start_date > v_today THEN
    RAISE EXCEPTION 'season_start_date_invalid';
  END IF;
  IF p_target_date IS NULL OR p_target_date < p_start_date THEN
    RAISE EXCEPTION 'season_target_date_invalid';
  END IF;
  IF p_target_weight IS NULL OR p_target_weight < 20 OR p_target_weight > 200 THEN
    RAISE EXCEPTION 'season_target_weight_invalid';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_user_id::TEXT, 742));

  SELECT *
    INTO v_active
  FROM public.seasons
  WHERE user_id = v_user_id
    AND status = 'active'
  FOR UPDATE;

  IF v_active.id IS DISTINCT FROM p_expected_active_season_id THEN
    RAISE EXCEPTION 'active_season_changed';
  END IF;

  IF v_active.id IS NOT NULL AND p_start_date <= v_active.start_date THEN
    RAISE EXCEPTION 'season_switch_date_invalid';
  END IF;

  SELECT weight
    INTO v_start_weight
  FROM public.daily_logs
  WHERE user_id = v_user_id
    AND log_date <= p_start_date
    AND weight IS NOT NULL
  ORDER BY log_date DESC
  LIMIT 1;

  IF v_start_weight IS NULL THEN
    RAISE EXCEPTION 'season_start_weight_missing';
  END IF;

  IF v_active.id IS NOT NULL THEN
    SELECT weight
      INTO v_end_weight
    FROM public.daily_logs
    WHERE user_id = v_user_id
      AND log_date <= p_start_date - 1
      AND weight IS NOT NULL
    ORDER BY log_date DESC
    LIMIT 1;

    UPDATE public.seasons
       SET status = 'completed',
           end_date = p_start_date - 1,
           end_weight = v_end_weight
     WHERE id = v_active.id
       AND user_id = v_user_id;
  END IF;

  INSERT INTO public.seasons (
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
  ) VALUES (
    v_user_id,
    BTRIM(p_name),
    p_phase,
    p_start_date,
    v_start_weight,
    p_target_date,
    p_target_weight,
    'active',
    TO_CHAR(p_start_date, 'YYYY-MM'),
    v_start_weight,
    '[]'::JSONB
  )
  RETURNING id INTO v_new_season_id;

  UPDATE public.daily_logs AS d
     SET season_id = public.resolve_season_id(d.user_id, d.log_date)
   WHERE d.user_id = v_user_id
     AND d.season_id IS DISTINCT FROM public.resolve_season_id(d.user_id, d.log_date);

  PERFORM public.sync_current_season_settings(
    v_user_id,
    BTRIM(p_name),
    p_phase,
    p_target_date,
    p_target_weight,
    TO_CHAR(p_start_date, 'YYYY-MM'),
    v_start_weight,
    '[]'::JSONB
  );

  RETURN v_new_season_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.end_active_season(
  p_expected_active_season_id BIGINT,
  p_end_date DATE
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
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'auth_required';
  END IF;
  IF p_end_date IS NULL OR p_end_date > v_today THEN
    RAISE EXCEPTION 'season_end_date_invalid';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_user_id::TEXT, 742));

  SELECT *
    INTO v_active
  FROM public.seasons
  WHERE user_id = v_user_id
    AND status = 'active'
  FOR UPDATE;

  IF v_active.id IS DISTINCT FROM p_expected_active_season_id THEN
    RAISE EXCEPTION 'active_season_changed';
  END IF;
  IF v_active.id IS NULL THEN
    RAISE EXCEPTION 'active_season_not_found';
  END IF;
  IF p_end_date < v_active.start_date THEN
    RAISE EXCEPTION 'season_end_date_invalid';
  END IF;

  SELECT weight
    INTO v_end_weight
  FROM public.daily_logs
  WHERE user_id = v_user_id
    AND log_date <= p_end_date
    AND weight IS NOT NULL
  ORDER BY log_date DESC
  LIMIT 1;

  UPDATE public.seasons
     SET status = 'completed',
         end_date = p_end_date,
         end_weight = v_end_weight
   WHERE id = v_active.id
     AND user_id = v_user_id;

  UPDATE public.daily_logs AS d
     SET season_id = public.resolve_season_id(d.user_id, d.log_date)
   WHERE d.user_id = v_user_id
     AND d.season_id IS DISTINCT FROM public.resolve_season_id(d.user_id, d.log_date);

  PERFORM public.sync_current_season_settings(
    v_user_id,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL
  );

  RETURN v_active.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_active_season_goal(
  p_expected_active_season_id BIGINT,
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
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'auth_required';
  END IF;
  IF p_target_weight IS NULL OR p_target_weight < 20 OR p_target_weight > 200 THEN
    RAISE EXCEPTION 'season_target_weight_invalid';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_user_id::TEXT, 742));

  SELECT *
    INTO v_active
  FROM public.seasons
  WHERE user_id = v_user_id
    AND status = 'active'
  FOR UPDATE;

  IF v_active.id IS DISTINCT FROM p_expected_active_season_id THEN
    RAISE EXCEPTION 'active_season_changed';
  END IF;
  IF v_active.id IS NULL THEN
    RAISE EXCEPTION 'active_season_not_found';
  END IF;
  IF p_target_date IS NULL OR p_target_date < v_active.start_date THEN
    RAISE EXCEPTION 'season_target_date_invalid';
  END IF;

  UPDATE public.seasons
     SET target_date = p_target_date,
         target_weight = p_target_weight
   WHERE id = v_active.id
     AND user_id = v_user_id;

  PERFORM public.sync_current_season_settings(
    v_user_id,
    v_active.name,
    v_active.phase,
    p_target_date,
    p_target_weight,
    v_active.monthly_plan_start_month,
    v_active.monthly_plan_start_weight,
    v_active.monthly_plan_overrides
  );

  RETURN v_active.id;
END;
$$;

REVOKE ALL ON FUNCTION public.start_or_switch_season(BIGINT, TEXT, TEXT, DATE, DATE, NUMERIC) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.end_active_season(BIGINT, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_active_season_goal(BIGINT, DATE, NUMERIC) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.start_or_switch_season(BIGINT, TEXT, TEXT, DATE, DATE, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.end_active_season(BIGINT, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_active_season_goal(BIGINT, DATE, NUMERIC) TO authenticated;

-- 通常導線から season を削除できないよう、authenticated の DELETE policy を撤去する。
DROP POLICY IF EXISTS "authenticated owner can delete seasons" ON public.seasons;
