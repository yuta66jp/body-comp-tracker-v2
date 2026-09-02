-- #775: Bulkシーズン内の体重調整期間と増量評価期間を分離する。

ALTER TABLE public.seasons
  ADD COLUMN IF NOT EXISTS monthly_plan_start_date DATE;

UPDATE public.seasons
SET monthly_plan_start_date = GREATEST(
  start_date,
  (monthly_plan_start_month || '-01')::DATE
)
WHERE monthly_plan_start_date IS NULL
  AND monthly_plan_start_month IS NOT NULL
  AND monthly_plan_start_weight IS NOT NULL;

DO $$
BEGIN
  ALTER TABLE public.seasons
    ADD CONSTRAINT seasons_monthly_plan_start_consistency_check CHECK (
      (monthly_plan_start_date IS NULL
       AND monthly_plan_start_month IS NULL
       AND monthly_plan_start_weight IS NULL)
      OR
      (monthly_plan_start_date IS NOT NULL
       AND monthly_plan_start_month = TO_CHAR(monthly_plan_start_date, 'YYYY-MM')
       AND monthly_plan_start_weight IS NOT NULL
       AND monthly_plan_start_date BETWEEN start_date AND target_date)
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

COMMENT ON COLUMN public.seasons.monthly_plan_start_date IS
  '月次計画とBulk評価の開始日。Bulkでは同日のdaily_logs.weightを開始体重として固定する。';

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

  IF CURRENT_USER <> 'postgres'
     AND (
       NEW.target_date IS DISTINCT FROM OLD.target_date
       OR NEW.target_weight IS DISTINCT FROM OLD.target_weight
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.end_date IS DISTINCT FROM OLD.end_date
       OR NEW.end_weight IS DISTINCT FROM OLD.end_weight
       OR NEW.monthly_plan_start_date IS DISTINCT FROM OLD.monthly_plan_start_date
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

-- 新しいシーズンでは従来どおりシーズン開始日を計画開始日として初期化する。
CREATE OR REPLACE FUNCTION public.initialize_season_plan_start_date()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.monthly_plan_start_date IS NULL
     AND NEW.monthly_plan_start_month IS NOT NULL
     AND NEW.monthly_plan_start_weight IS NOT NULL THEN
    NEW.monthly_plan_start_date := NEW.start_date;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS seasons_initialize_plan_start_date ON public.seasons;
CREATE TRIGGER seasons_initialize_plan_start_date
BEFORE INSERT ON public.seasons
FOR EACH ROW EXECUTE FUNCTION public.initialize_season_plan_start_date();

REVOKE ALL ON FUNCTION public.initialize_season_plan_start_date() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.update_active_season_plan_start(
  p_expected_active_season_id BIGINT,
  p_expected_active_season_updated_at TIMESTAMPTZ,
  p_plan_start_date DATE
) RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_today DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')::DATE;
  v_active public.seasons%ROWTYPE;
  v_plan_start_weight NUMERIC;
  v_plan_start_month TEXT;
  v_overrides JSONB;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
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
  IF v_active.phase <> 'Bulk' THEN RAISE EXCEPTION 'season_plan_start_bulk_only'; END IF;
  IF p_plan_start_date IS NULL
     OR p_plan_start_date < v_active.start_date
     OR p_plan_start_date > v_today
     OR p_plan_start_date > v_active.target_date THEN
    RAISE EXCEPTION 'season_plan_start_date_invalid';
  END IF;

  SELECT weight INTO v_plan_start_weight
  FROM public.daily_logs
  WHERE user_id = v_user_id
    AND log_date = p_plan_start_date
    AND weight IS NOT NULL;
  IF v_plan_start_weight IS NULL THEN
    RAISE EXCEPTION 'season_plan_start_weight_missing';
  END IF;

  v_plan_start_month := TO_CHAR(p_plan_start_date, 'YYYY-MM');
  v_overrides := public.normalize_season_plan_overrides(
    v_active.monthly_plan_overrides,
    v_plan_start_month,
    v_active.target_date
  );

  UPDATE public.seasons
  SET monthly_plan_start_date = p_plan_start_date,
      monthly_plan_start_month = v_plan_start_month,
      monthly_plan_start_weight = v_plan_start_weight,
      monthly_plan_overrides = v_overrides
  WHERE id = v_active.id AND user_id = v_user_id;

  PERFORM public.sync_current_season_settings(
    v_user_id, v_active.name, v_active.phase, v_active.target_date,
    v_active.target_weight, v_plan_start_month, v_plan_start_weight, v_overrides
  );
  RETURN v_active.id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_active_season_plan_start(BIGINT, TIMESTAMPTZ, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_active_season_plan_start(BIGINT, TIMESTAMPTZ, DATE) TO authenticated;

-- 目標日の変更でも計画開始日より前へ期限を戻せないようにする。
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
  IF p_target_date IS NULL
     OR p_target_date < v_active.start_date
     OR p_target_date < v_active.monthly_plan_start_date THEN
    RAISE EXCEPTION 'season_target_date_invalid';
  END IF;

  v_overrides := public.normalize_season_plan_overrides(
    v_active.monthly_plan_overrides,
    v_active.monthly_plan_start_month,
    p_target_date
  );
  UPDATE public.seasons
  SET target_date = p_target_date,
      target_weight = p_target_weight,
      monthly_plan_overrides = v_overrides
  WHERE id = v_active.id AND user_id = v_user_id;

  PERFORM public.sync_current_season_settings(
    v_user_id, v_active.name, v_active.phase, p_target_date, p_target_weight,
    v_active.monthly_plan_start_month, v_active.monthly_plan_start_weight, v_overrides
  );
  RETURN v_active.id;
END;
$$;

-- 開始日の体重を修正した場合は計画アンカーも同じtransactionで同期する。
-- 参照中の記録は、開始日を変更するまで削除・空欄化できない。
CREATE OR REPLACE FUNCTION public.sync_active_season_plan_start_weight()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (
      SELECT 1 FROM public.seasons
      WHERE user_id = OLD.user_id
        AND status = 'active'
        AND phase = 'Bulk'
        AND monthly_plan_start_date = OLD.log_date
    ) THEN
      RAISE EXCEPTION 'season_plan_start_log_required';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.weight IS DISTINCT FROM OLD.weight
     AND EXISTS (
       SELECT 1 FROM public.seasons
       WHERE user_id = NEW.user_id
         AND status = 'active'
         AND phase = 'Bulk'
         AND monthly_plan_start_date = NEW.log_date
     ) THEN
    IF NEW.weight IS NULL THEN
      RAISE EXCEPTION 'season_plan_start_log_required';
    END IF;
    UPDATE public.seasons
    SET monthly_plan_start_weight = NEW.weight
    WHERE user_id = NEW.user_id
      AND status = 'active'
      AND phase = 'Bulk'
      AND monthly_plan_start_date = NEW.log_date;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS daily_logs_sync_active_season_plan_start_weight ON public.daily_logs;
CREATE TRIGGER daily_logs_sync_active_season_plan_start_weight
BEFORE UPDATE OF weight OR DELETE ON public.daily_logs
FOR EACH ROW EXECUTE FUNCTION public.sync_active_season_plan_start_weight();

REVOKE ALL ON FUNCTION public.sync_active_season_plan_start_weight() FROM PUBLIC;
