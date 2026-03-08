-- career_logs: 過去シーズンの体重ログ (旧 history.csv の移行先)
CREATE TABLE IF NOT EXISTS career_logs (
  id          BIGSERIAL PRIMARY KEY,
  log_date    DATE   NOT NULL,
  weight      FLOAT  NOT NULL,
  season      TEXT   NOT NULL,  -- "2021_TokyoNovice" など
  target_date DATE   NOT NULL,  -- 大会日 (days_out の基準)
  note        TEXT,
  UNIQUE (log_date, season)
);

-- RLS: anon は読み取りのみ、service_role は全操作
ALTER TABLE career_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon can read career_logs"
  ON career_logs FOR SELECT USING (true);

CREATE POLICY "service_role can all on career_logs"
  ON career_logs FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 検索用インデックス
CREATE INDEX IF NOT EXISTS career_logs_season_idx ON career_logs (season);
CREATE INDEX IF NOT EXISTS career_logs_log_date_idx ON career_logs (log_date);
