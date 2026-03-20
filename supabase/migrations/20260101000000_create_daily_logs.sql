-- daily_logs: 日次ログ（ベーステーブル）
--
-- このファイルは初期作成 migration。
-- 後続の migration で以下のカラムが追加される:
--   20260311000001 : is_cheat_day / is_refeed_day / is_eating_out / is_poor_sleep
--   20260313000000 : sleep_hours / had_bowel_movement / training_type / work_mode / leg_flag
--   20260315000000 : had_bowel_movement を BOOLEAN DEFAULT NULL に変更
--   20260315000001 : RPC save_daily_log_partial を作成
--   20260315000002 : is_travel_day を追加
--   20260315000003 : RPC を UPDATE-first 方式に変更
--   20260315000004 : updated_at カラムと自動更新トリガーを追加
--   20260316000000 : training_type CHECK 制約に 'off' を追加
--   20260316000001 : 零値マクロを NULL に補正

CREATE TABLE IF NOT EXISTS daily_logs (
  log_date  DATE    PRIMARY KEY,
  weight    NUMERIC,
  calories  NUMERIC,
  protein   NUMERIC,
  fat       NUMERIC,
  carbs     NUMERIC,
  note      TEXT
);

COMMENT ON TABLE  daily_logs          IS '日次ログ。log_date (JST) が主キー。';
COMMENT ON COLUMN daily_logs.log_date IS '記録日 (JST)。PK。';
COMMENT ON COLUMN daily_logs.weight   IS '体重 (kg)。null = 未記録。';
COMMENT ON COLUMN daily_logs.calories IS '摂取カロリー (kcal)。null = 未記録。';
COMMENT ON COLUMN daily_logs.protein  IS 'タンパク質 (g)。null = 未記録。';
COMMENT ON COLUMN daily_logs.fat      IS '脂質 (g)。null = 未記録。';
COMMENT ON COLUMN daily_logs.carbs    IS '炭水化物 (g)。null = 未記録。';
COMMENT ON COLUMN daily_logs.note     IS 'メモ。null = 未記録。';

-- RLS: 個人利用アプリのため anon キーで全操作を許可する
-- service_role（ML バッチ）は RLS をバイパスするため policy 不要
ALTER TABLE daily_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "anon can select daily_logs"
    ON daily_logs FOR SELECT TO anon USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "anon can insert daily_logs"
    ON daily_logs FOR INSERT TO anon WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "anon can update daily_logs"
    ON daily_logs FOR UPDATE TO anon USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "anon can delete daily_logs"
    ON daily_logs FOR DELETE TO anon USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
