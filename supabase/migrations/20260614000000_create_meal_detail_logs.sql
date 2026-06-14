-- Create meal detail logs (#728)
--
-- meal_items becomes the source of truth for nutrition detail.
-- daily_logs.calories/protein/fat/carbs are kept as projection values for
-- existing Dashboard / Macro / TDEE / ML consumers.

-- ── daily_logs FK prerequisite ──────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'uq_daily_logs_user_id_log_date'
       AND conrelid = 'daily_logs'::regclass
  ) THEN
    ALTER TABLE daily_logs
      ADD CONSTRAINT uq_daily_logs_user_id_log_date UNIQUE (user_id, log_date);
  END IF;
END $$;

-- ── meal_entries: one row per meal event ────────────────────────────────────

CREATE TABLE IF NOT EXISTS meal_entries (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  log_date   DATE        NOT NULL,
  meal_type  TEXT        NOT NULL,
  title      TEXT,
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_meal_entries_id_user_id UNIQUE (id, user_id),
  CONSTRAINT fk_meal_entries_daily_logs
    FOREIGN KEY (user_id, log_date)
    REFERENCES daily_logs(user_id, log_date)
    ON DELETE CASCADE,
  CONSTRAINT chk_meal_entries_meal_type
    CHECK (meal_type IN ('meal_1', 'meal_2', 'meal_3', 'meal_4', 'other'))
);

CREATE INDEX IF NOT EXISTS idx_meal_entries_user_date
  ON meal_entries(user_id, log_date);

COMMENT ON TABLE meal_entries IS
  '食事ログの食事単位。1行 = 1食事。daily_logs の日付に紐づく。';
COMMENT ON COLUMN meal_entries.user_id IS 'Owner Supabase auth.users.id。';
COMMENT ON COLUMN meal_entries.log_date IS '記録日 (JST)。daily_logs.log_date と同じ日付軸。';
COMMENT ON COLUMN meal_entries.meal_type IS
  '食事区分: meal_1 / meal_2 / meal_3 / meal_4 / other。';
COMMENT ON COLUMN meal_entries.title IS '任意の食事名。';
COMMENT ON COLUMN meal_entries.note IS '食事単位メモ。';

-- ── meal_items: one row per food item ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS meal_items (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  meal_entry_id      UUID        NOT NULL,
  item_order         INTEGER     NOT NULL DEFAULT 0,
  source_type        TEXT        NOT NULL,
  source_name        TEXT,
  food_name          TEXT        NOT NULL,
  amount_g           NUMERIC,
  calories_kcal      NUMERIC,
  protein_g          NUMERIC,
  fat_g              NUMERIC,
  carbs_g            NUMERIC,
  calories_per_100g  NUMERIC,
  protein_per_100g   NUMERIC,
  fat_per_100g       NUMERIC,
  carbs_per_100g     NUMERIC,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_meal_items_meal_entries
    FOREIGN KEY (meal_entry_id, user_id)
    REFERENCES meal_entries(id, user_id)
    ON DELETE CASCADE,
  CONSTRAINT chk_meal_items_source_type
    CHECK (source_type IN ('food_master', 'menu_master', 'temp', 'manual', 'legacy_total')),
  CONSTRAINT chk_meal_items_item_order
    CHECK (item_order >= 0),
  CONSTRAINT chk_meal_items_amount_g
    CHECK (amount_g IS NULL OR amount_g >= 0),
  CONSTRAINT chk_meal_items_calories_kcal
    CHECK (calories_kcal IS NULL OR calories_kcal >= 0),
  CONSTRAINT chk_meal_items_protein_g
    CHECK (protein_g IS NULL OR protein_g >= 0),
  CONSTRAINT chk_meal_items_fat_g
    CHECK (fat_g IS NULL OR fat_g >= 0),
  CONSTRAINT chk_meal_items_carbs_g
    CHECK (carbs_g IS NULL OR carbs_g >= 0),
  CONSTRAINT chk_meal_items_calories_per_100g
    CHECK (calories_per_100g IS NULL OR calories_per_100g >= 0),
  CONSTRAINT chk_meal_items_protein_per_100g
    CHECK (protein_per_100g IS NULL OR protein_per_100g >= 0),
  CONSTRAINT chk_meal_items_fat_per_100g
    CHECK (fat_per_100g IS NULL OR fat_per_100g >= 0),
  CONSTRAINT chk_meal_items_carbs_per_100g
    CHECK (carbs_per_100g IS NULL OR carbs_per_100g >= 0)
);

CREATE INDEX IF NOT EXISTS idx_meal_items_user_entry
  ON meal_items(user_id, meal_entry_id);

COMMENT ON TABLE meal_items IS
  '食事ログの食品明細。daily_logs のカロリー/PFC集計の source of truth。';
COMMENT ON COLUMN meal_items.source_type IS
  '入力元: food_master / menu_master / temp / manual / legacy_total。';
COMMENT ON COLUMN meal_items.source_name IS '元食品名・メニュー名。';
COMMENT ON COLUMN meal_items.food_name IS '表示用食品名。';
COMMENT ON COLUMN meal_items.amount_g IS '摂取量 (g)。詳細不明・手入力では NULL 可。';
COMMENT ON COLUMN meal_items.calories_kcal IS 'この明細のカロリー (kcal)。';
COMMENT ON COLUMN meal_items.protein_g IS 'この明細のタンパク質 (g)。';
COMMENT ON COLUMN meal_items.fat_g IS 'この明細の脂質 (g)。';
COMMENT ON COLUMN meal_items.carbs_g IS 'この明細の炭水化物 (g)。';
COMMENT ON COLUMN meal_items.calories_per_100g IS '保存時点の100gあたりカロリー。';
COMMENT ON COLUMN meal_items.protein_per_100g IS '保存時点の100gあたりタンパク質。';
COMMENT ON COLUMN meal_items.fat_per_100g IS '保存時点の100gあたり脂質。';
COMMENT ON COLUMN meal_items.carbs_per_100g IS '保存時点の100gあたり炭水化物。';

-- ── updated_at triggers ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at_meal_entries()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_updated_at_meal_entries ON meal_entries;
CREATE TRIGGER trg_set_updated_at_meal_entries
BEFORE UPDATE ON meal_entries
FOR EACH ROW EXECUTE FUNCTION set_updated_at_meal_entries();

CREATE OR REPLACE FUNCTION set_updated_at_meal_items()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_updated_at_meal_items ON meal_items;
CREATE TRIGGER trg_set_updated_at_meal_items
BEFORE UPDATE ON meal_items
FOR EACH ROW EXECUTE FUNCTION set_updated_at_meal_items();

-- ── Projection sync to daily_logs ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION recalc_daily_log_nutrition(
  p_user_id UUID,
  p_log_date DATE
) RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_item_count INTEGER;
  v_calories   NUMERIC;
  v_protein    NUMERIC;
  v_fat        NUMERIC;
  v_carbs      NUMERIC;
BEGIN
  SELECT
    COUNT(mi.id)::INTEGER,
    SUM(mi.calories_kcal),
    SUM(mi.protein_g),
    SUM(mi.fat_g),
    SUM(mi.carbs_g)
  INTO
    v_item_count,
    v_calories,
    v_protein,
    v_fat,
    v_carbs
  FROM meal_entries me
  JOIN meal_items mi
    ON mi.meal_entry_id = me.id
   AND mi.user_id = me.user_id
  WHERE me.user_id = p_user_id
    AND me.log_date = p_log_date;

  UPDATE daily_logs
  SET
    calories = CASE WHEN v_item_count = 0 THEN NULL ELSE COALESCE(v_calories, 0) END,
    protein  = CASE WHEN v_item_count = 0 THEN NULL ELSE COALESCE(v_protein,  0) END,
    fat      = CASE WHEN v_item_count = 0 THEN NULL ELSE COALESCE(v_fat,      0) END,
    carbs    = CASE WHEN v_item_count = 0 THEN NULL ELSE COALESCE(v_carbs,    0) END
  WHERE user_id = p_user_id
    AND log_date = p_log_date;
END;
$$;

COMMENT ON FUNCTION recalc_daily_log_nutrition(UUID, DATE) IS
  'meal_items から対象日のカロリー/PFCを再計算し、daily_logs の projection 列へ同期する。';

CREATE OR REPLACE FUNCTION sync_daily_log_nutrition_from_meal_item()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_old_log_date DATE;
  v_new_log_date DATE;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    SELECT log_date INTO v_old_log_date
      FROM meal_entries
     WHERE id = OLD.meal_entry_id
       AND user_id = OLD.user_id;

    IF v_old_log_date IS NOT NULL THEN
      PERFORM recalc_daily_log_nutrition(OLD.user_id, v_old_log_date);
    END IF;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    SELECT log_date INTO v_new_log_date
      FROM meal_entries
     WHERE id = NEW.meal_entry_id
       AND user_id = NEW.user_id;

    IF v_new_log_date IS NOT NULL THEN
      PERFORM recalc_daily_log_nutrition(NEW.user_id, v_new_log_date);
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_daily_log_nutrition_from_meal_item ON meal_items;
CREATE TRIGGER trg_sync_daily_log_nutrition_from_meal_item
AFTER INSERT OR UPDATE OR DELETE ON meal_items
FOR EACH ROW EXECUTE FUNCTION sync_daily_log_nutrition_from_meal_item();

-- ── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE meal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated owner can select meal_entries" ON meal_entries;
DROP POLICY IF EXISTS "authenticated owner can insert meal_entries" ON meal_entries;
DROP POLICY IF EXISTS "authenticated owner can update meal_entries" ON meal_entries;
DROP POLICY IF EXISTS "authenticated owner can delete meal_entries" ON meal_entries;

CREATE POLICY "authenticated owner can select meal_entries"
  ON meal_entries FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "authenticated owner can insert meal_entries"
  ON meal_entries FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "authenticated owner can update meal_entries"
  ON meal_entries FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "authenticated owner can delete meal_entries"
  ON meal_entries FOR DELETE TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "authenticated owner can select meal_items" ON meal_items;
DROP POLICY IF EXISTS "authenticated owner can insert meal_items" ON meal_items;
DROP POLICY IF EXISTS "authenticated owner can update meal_items" ON meal_items;
DROP POLICY IF EXISTS "authenticated owner can delete meal_items" ON meal_items;

CREATE POLICY "authenticated owner can select meal_items"
  ON meal_items FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "authenticated owner can insert meal_items"
  ON meal_items FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "authenticated owner can update meal_items"
  ON meal_items FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "authenticated owner can delete meal_items"
  ON meal_items FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ── Backfill existing nutrition totals as legacy detail ─────────────────────

INSERT INTO meal_entries (user_id, log_date, meal_type, title)
SELECT dl.user_id, dl.log_date, 'other', '既存記録'
  FROM daily_logs dl
 WHERE dl.user_id IS NOT NULL
   AND (
     dl.calories IS NOT NULL
     OR dl.protein IS NOT NULL
     OR dl.fat IS NOT NULL
     OR dl.carbs IS NOT NULL
   )
   AND NOT EXISTS (
     SELECT 1
       FROM meal_entries me
      WHERE me.user_id = dl.user_id
        AND me.log_date = dl.log_date
        AND me.meal_type = 'other'
        AND me.title = '既存記録'
   );

INSERT INTO meal_items (
  user_id,
  meal_entry_id,
  item_order,
  source_type,
  food_name,
  calories_kcal,
  protein_g,
  fat_g,
  carbs_g
)
SELECT
  dl.user_id,
  me.id,
  0,
  'legacy_total',
  '既存食事記録（詳細不明）',
  dl.calories,
  dl.protein,
  dl.fat,
  dl.carbs
FROM daily_logs dl
JOIN meal_entries me
  ON me.user_id = dl.user_id
 AND me.log_date = dl.log_date
 AND me.meal_type = 'other'
 AND me.title = '既存記録'
WHERE dl.user_id IS NOT NULL
  AND (
    dl.calories IS NOT NULL
    OR dl.protein IS NOT NULL
    OR dl.fat IS NOT NULL
    OR dl.carbs IS NOT NULL
  )
  AND NOT EXISTS (
    SELECT 1
      FROM meal_items mi
     WHERE mi.user_id = me.user_id
       AND mi.meal_entry_id = me.id
       AND mi.source_type = 'legacy_total'
  );
