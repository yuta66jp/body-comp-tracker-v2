-- settings: アプリ設定（key-value ストア）
--
-- 目標体重・大会日・月次目標・現在フェーズなどのアプリ設定を key-value 形式で保持する。
-- 数値は value_num、文字列は value_str に格納する。
--
-- 代表的な key 一覧（参考）:
--   goal_weight           : 目標体重 (kg) — value_num
--   contest_date          : 大会日 (YYYY-MM-DD) — value_str
--   monthly_plan_overrides: 月次目標 override リスト (JSON) — value_str  ← #101
--   current_phase         : 現在フェーズ ("Cut" | "Bulk") — value_str
--   current_season        : 現在シーズン名 — value_str
--
-- 廃止済み key:
--   monthly_target : アプリ廃止 (#132)。DB 上の残存行は #134 migration で削除済み。

CREATE TABLE IF NOT EXISTS settings (
  key       TEXT    PRIMARY KEY,
  value_num NUMERIC,
  value_str TEXT
);

COMMENT ON TABLE  settings           IS 'アプリ設定。key-value 形式。';
COMMENT ON COLUMN settings.key       IS '設定キー（PK）。';
COMMENT ON COLUMN settings.value_num IS '数値型設定値（例: 目標体重）。';
COMMENT ON COLUMN settings.value_str IS '文字列型設定値（例: 大会日、フェーズ）。';

-- RLS: 個人利用アプリのため anon キーで全操作を許可する
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "anon can select settings"
    ON settings FOR SELECT TO anon USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "anon can insert settings"
    ON settings FOR INSERT TO anon WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "anon can update settings"
    ON settings FOR UPDATE TO anon USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "anon can delete settings"
    ON settings FOR DELETE TO anon USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
