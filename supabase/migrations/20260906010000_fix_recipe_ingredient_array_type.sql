-- #790: 空配列の型を明示してDB lintの暗黙キャスト警告を解消する。
CREATE OR REPLACE FUNCTION public.valid_recipe_ingredients(items JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
DECLARE
  item JSONB;
  nutrient TEXT;
  food_names TEXT[] := ARRAY[]::TEXT[];
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
