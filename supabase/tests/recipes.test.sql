-- #788: 料理定義の制約・所有者分離・スナップショット。テストデータはすべてROLLBACK。
BEGIN;
INSERT INTO auth.users(id) VALUES
  ('78800000-0000-0000-0000-000000000001'),
  ('78800000-0000-0000-0000-000000000002');
INSERT INTO public.food_master(user_id, name, calories, protein, fat, carbs)
VALUES ('78800000-0000-0000-0000-000000000001', 'recipe788-test-food', 100, 20, 1, 0);

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '78800000-0000-0000-0000-000000000001';

INSERT INTO public.recipe_master(id, name, ingredients)
VALUES ('78800000-0000-0000-0000-000000000003', 'recipe788-test-dish',
  '[{"name":"recipe788-test-food","grams":150.5,"calories":100,"protein":20,"fat":1,"carbs":0}]');

DO $$
DECLARE
  invalid JSONB;
  before_version TIMESTAMPTZ;
BEGIN
  IF (SELECT user_id FROM recipe_master WHERE name = 'recipe788-test-dish') <> auth.uid() THEN
    RAISE EXCEPTION 'recipe owner must default to auth.uid';
  END IF;
  SELECT updated_at INTO before_version FROM recipe_master WHERE name = 'recipe788-test-dish';
  UPDATE recipe_master SET is_archived = TRUE WHERE name = 'recipe788-test-dish';
  IF (SELECT updated_at FROM recipe_master WHERE name = 'recipe788-test-dish') <= before_version THEN
    RAISE EXCEPTION 'recipe updates must advance version';
  END IF;
  BEGIN
    INSERT INTO recipe_master(name, ingredients)
    SELECT name, ingredients FROM recipe_master WHERE name = 'recipe788-test-dish';
    RAISE EXCEPTION 'archived names must remain unique';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO recipe_master(name, ingredients)
    SELECT ' untrimmed ', ingredients FROM recipe_master WHERE name = 'recipe788-test-dish';
    RAISE EXCEPTION 'untrimmed names must be rejected';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  FOR invalid IN SELECT value FROM jsonb_array_elements('[
    [], null, {},
    [{"name":"a","grams":0,"calories":0,"protein":0,"fat":0,"carbs":0}],
    [{"name":"a","grams":-1,"calories":1,"protein":0,"fat":0,"carbs":0}],
    [{"name":"a","grams":1,"calories":null,"protein":0,"fat":0,"carbs":0}],
    [{"name":"a","grams":1,"calories":1,"protein":-1,"fat":0,"carbs":0}],
    [{"name":"a","grams":"1","calories":1,"protein":0,"fat":0,"carbs":0}],
    [{"name":"a","grams":1e308,"calories":1000,"protein":0,"fat":0,"carbs":0}],
    [{"name":"a","grams":1,"calories":1,"protein":0,"fat":0,"carbs":0},{"name":"a","grams":1,"calories":1,"protein":0,"fat":0,"carbs":0}]
  ]') LOOP
    BEGIN
      INSERT INTO recipe_master(name, ingredients) VALUES ('invalid', invalid);
      RAISE EXCEPTION 'invalid ingredients accepted: %', invalid;
    EXCEPTION WHEN check_violation OR not_null_violation THEN NULL;
    END;
  END LOOP;
END;
$$;

-- 材料食品を削除しても料理定義は変わらず、複製もできる。
DELETE FROM food_master WHERE name = 'recipe788-test-food';
INSERT INTO recipe_master(name, ingredients, note)
SELECT 'recipe788-copy', ingredients, note FROM recipe_master WHERE name = 'recipe788-test-dish';
DO $$
BEGIN
  IF (SELECT ingredients->0->>'calories' FROM recipe_master WHERE name = 'recipe788-copy') <> '100' THEN
    RAISE EXCEPTION 'snapshot must survive food deletion and copy';
  END IF;
  UPDATE recipe_master SET is_archived = FALSE WHERE name = 'recipe788-test-dish';
  IF NOT FOUND THEN RAISE EXCEPTION 'owner must be able to restore recipe'; END IF;
END;
$$;

SET LOCAL request.jwt.claim.sub = '78800000-0000-0000-0000-000000000002';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM recipe_master WHERE id = '78800000-0000-0000-0000-000000000003') THEN
    RAISE EXCEPTION 'other users must not read recipes';
  END IF;
  UPDATE recipe_master SET name = 'not allowed' WHERE id = '78800000-0000-0000-0000-000000000003';
  IF FOUND THEN RAISE EXCEPTION 'other users must not update recipes'; END IF;
  BEGIN
    INSERT INTO recipe_master(user_id, name, ingredients)
    VALUES ('78800000-0000-0000-0000-000000000001', 'not allowed', '[{"name":"a","grams":1,"calories":1,"protein":0,"fat":0,"carbs":0}]');
    RAISE EXCEPTION 'must not create a recipe owned by another user';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
-- 他ユーザーは同じ料理名を使用できる。
INSERT INTO recipe_master(name, ingredients)
VALUES ('recipe788-test-dish', '[{"name":"a","grams":1,"calories":1,"protein":0,"fat":0,"carbs":0}]');

SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM 1 FROM public.recipe_master;
    RAISE EXCEPTION 'anonymous recipe reads must be denied';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
ROLLBACK;
