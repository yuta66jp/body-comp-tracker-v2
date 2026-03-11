-- daily_logs に特殊日タグ列を追加
-- NOT NULL DEFAULT FALSE: 既存行は全て false になる
ALTER TABLE daily_logs
  ADD COLUMN IF NOT EXISTS is_cheat_day  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_refeed_day BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_eating_out BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_poor_sleep BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN daily_logs.is_cheat_day  IS 'チートデイ: 意図的な高カロリー摂取日';
COMMENT ON COLUMN daily_logs.is_refeed_day IS 'リフィード: 炭水化物を意図的に増やした日';
COMMENT ON COLUMN daily_logs.is_eating_out IS '外食: 摂取量が把握しにくい外食日';
COMMENT ON COLUMN daily_logs.is_poor_sleep IS '睡眠不良: 睡眠の質・量が不足した日';
