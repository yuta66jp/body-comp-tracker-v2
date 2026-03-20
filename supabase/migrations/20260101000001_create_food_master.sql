-- food_master: 食品マスタ
--
-- MealLogger（フロントエンド）が食品検索・カロリー計算に使用する。
-- 食品名が PK。anon キーで全操作可能（個人利用）。

CREATE TABLE IF NOT EXISTS food_master (
  name     TEXT    PRIMARY KEY,
  protein  NUMERIC NOT NULL,
  fat      NUMERIC NOT NULL,
  carbs    NUMERIC NOT NULL,
  calories NUMERIC NOT NULL,
  category TEXT
);

COMMENT ON TABLE  food_master          IS '食品マスタ。name が PK。';
COMMENT ON COLUMN food_master.name     IS '食品名（PK）。';
COMMENT ON COLUMN food_master.protein  IS 'タンパク質 (g / 100g)。';
COMMENT ON COLUMN food_master.fat      IS '脂質 (g / 100g)。';
COMMENT ON COLUMN food_master.carbs    IS '炭水化物 (g / 100g)。';
COMMENT ON COLUMN food_master.calories IS 'カロリー (kcal / 100g)。';
COMMENT ON COLUMN food_master.category IS 'カテゴリ（任意）。例: 肉/魚/野菜/乳製品/穀物 等。';

-- RLS: 個人利用アプリのため anon キーで全操作を許可する
ALTER TABLE food_master ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "anon can select food_master"
    ON food_master FOR SELECT TO anon USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "anon can insert food_master"
    ON food_master FOR INSERT TO anon WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "anon can update food_master"
    ON food_master FOR UPDATE TO anon USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "anon can delete food_master"
    ON food_master FOR DELETE TO anon USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
