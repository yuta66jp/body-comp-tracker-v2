-- predictions: ML バッチの体重予測結果
CREATE TABLE IF NOT EXISTS predictions (
  id            BIGSERIAL PRIMARY KEY,
  ds            DATE        NOT NULL UNIQUE,
  yhat          FLOAT       NOT NULL,
  model_version TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- analytics_cache: XGBoost 重要度・enrich 結果などを JSONB で保存
CREATE TABLE IF NOT EXISTS analytics_cache (
  metric_type TEXT        PRIMARY KEY,
  payload     JSONB       NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: anon は読み取りのみ許可
ALTER TABLE predictions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon can read predictions"
  ON predictions FOR SELECT USING (true);

CREATE POLICY "anon can read analytics_cache"
  ON analytics_cache FOR SELECT USING (true);
