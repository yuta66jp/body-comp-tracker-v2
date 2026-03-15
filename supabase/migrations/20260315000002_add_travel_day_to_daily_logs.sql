-- daily_logs に旅行タグ列を追加
-- NOT NULL DEFAULT FALSE: 既存行は全て false になる
ALTER TABLE daily_logs
  ADD COLUMN IF NOT EXISTS is_travel_day BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN daily_logs.is_travel_day IS '旅行: 旅行・遠征など通常生活から外れた日。体重・カロリー・活動量の外れ値を後から識別するために使用する。';
