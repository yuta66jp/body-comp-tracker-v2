-- #788: 料理定義のみ保存。日次合計・既存食品・セットには変更を加えない。
CREATE OR REPLACE FUNCTION public.valid_recipe_ingredients(items JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
DECLARE
  item JSONB;
  nutrient TEXT;
  food_names TEXT[] := '{}';
  totals DOUBLE PRECISION[] := ARRAY[0, 0, 0, 0];
  i INTEGER;
BEGIN
  IF items IS NULL OR jsonb_typeof(items) <> 'array' THEN RETURN FALSE; END IF;
  IF jsonb_array_length(items) = 0 THEN RETURN FALSE; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(items) LOOP
    IF jsonb_typeof(item) <> 'object'
       OR jsonb_typeof(item->'name') IS DISTINCT FROM 'string'
       OR btrim(COALESCE(item->>'name', '')) = ''
       OR jsonb_typeof(item->'grams') IS DISTINCT FROM 'number' THEN RETURN FALSE; END IF;
    IF (item->>'grams')::DOUBLE PRECISION <= 0 THEN RETURN FALSE; END IF;
    IF (item->>'name') = ANY(food_names) THEN RETURN FALSE; END IF;
    food_names := array_append(food_names, item->>'name');
    i := 1;
    FOREACH nutrient IN ARRAY ARRAY['calories', 'protein', 'fat', 'carbs'] LOOP
      IF jsonb_typeof(item->nutrient) IS DISTINCT FROM 'number' THEN RETURN FALSE; END IF;
      IF (item->>nutrient)::DOUBLE PRECISION < 0 THEN RETURN FALSE; END IF;
      totals[i] := totals[i] + (item->>nutrient)::DOUBLE PRECISION * (item->>'grams')::DOUBLE PRECISION / 100;
      i := i + 1;
    END LOOP;
  END LOOP;
  RETURN TRUE;
EXCEPTION WHEN numeric_value_out_of_range OR invalid_text_representation THEN
  RETURN FALSE;
END;
$$;

CREATE TABLE public.recipe_master (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  name TEXT NOT NULL CHECK (name = btrim(name) AND name <> ''),
  ingredients JSONB NOT NULL CHECK (public.valid_recipe_ingredients(ingredients)),
  note TEXT NOT NULL DEFAULT '',
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT recipe_master_user_name_key UNIQUE (user_id, name)
);

COMMENT ON TABLE public.recipe_master IS '1食分の料理定義。摂取明細ではなく、日次記録は従来の合計値のみ。';
COMMENT ON COLUMN public.recipe_master.ingredients IS '食品名・100gあたり栄養値・1食分使用g数のスナップショット。食品への外部キーを持たず削除後も保持する。';

CREATE FUNCTION public.set_recipe_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

CREATE TRIGGER recipe_master_updated_at BEFORE UPDATE ON public.recipe_master
FOR EACH ROW EXECUTE FUNCTION public.set_recipe_updated_at();

ALTER TABLE public.recipe_master ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.recipe_master FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.recipe_master TO authenticated;
CREATE POLICY "owner can select recipes" ON public.recipe_master
FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "owner can insert recipes" ON public.recipe_master
FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "owner can update recipes" ON public.recipe_master
FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
