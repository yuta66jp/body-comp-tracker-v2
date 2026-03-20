-- menu_master: セットメニューマスタ
--
-- 複数食品をひとまとめにしたセットメニューを定義する。
-- MealLogger の「セットから追加」機能が参照する。
-- recipe は { name: string, amount: number }[] 形式の JSONB。

CREATE TABLE IF NOT EXISTS menu_master (
  name   TEXT  PRIMARY KEY,
  recipe JSONB NOT NULL
);

COMMENT ON TABLE  menu_master        IS 'セットメニューマスタ。name が PK。';
COMMENT ON COLUMN menu_master.name   IS 'メニュー名（PK）。';
COMMENT ON COLUMN menu_master.recipe IS 'レシピ: [{name: string, amount: number}]。amount は grams。';

-- RLS: 個人利用アプリのため anon キーで全操作を許可する
ALTER TABLE menu_master ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "anon can select menu_master"
    ON menu_master FOR SELECT TO anon USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "anon can insert menu_master"
    ON menu_master FOR INSERT TO anon WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "anon can update menu_master"
    ON menu_master FOR UPDATE TO anon USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "anon can delete menu_master"
    ON menu_master FOR DELETE TO anon USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
