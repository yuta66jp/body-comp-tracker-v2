-- forecast_backtest_runs: 1回の評価実行のメタ情報
-- どの設定・期間で backtest したかを管理する
CREATE TABLE IF NOT EXISTS forecast_backtest_runs (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  model_name       TEXT        NOT NULL,        -- 評価対象モデル群 ('all' or 特定モデル名)
  model_version    TEXT,                        -- 例: 'neuralprophet-v1'
  horizons         INT[]       NOT NULL,        -- 評価したホライズン [7,14,30]
  train_min_date   DATE,                        -- 使用した学習データの最古日
  train_max_date   DATE,                        -- 使用した学習データの最新日
  n_source_rows    INT         NOT NULL DEFAULT 0,
  notes            TEXT,
  config           JSONB       NOT NULL DEFAULT '{}'::jsonb
);

-- forecast_backtest_metrics: run単位・model単位・horizon単位の集計結果
-- UIで表示する主要テーブル
CREATE TABLE IF NOT EXISTS forecast_backtest_metrics (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id         UUID        NOT NULL REFERENCES forecast_backtest_runs(id) ON DELETE CASCADE,
  model_name     TEXT        NOT NULL,   -- 'NeuralProphet' / 'Naive' / 'MovingAverage7d' / 'LinearTrend30d'
  horizon_days   INT         NOT NULL,   -- 7 / 14 / 30
  mae            NUMERIC     NOT NULL,   -- Mean Absolute Error (kg)
  rmse           NUMERIC     NOT NULL,   -- Root Mean Squared Error (kg)
  mape           NUMERIC,               -- Mean Absolute Percentage Error (%) — ゼロ除算の場合は null
  bias           NUMERIC,               -- 平均誤差 (pred - actual): 正=上振れ傾向, 負=下振れ傾向
  n_predictions  INT         NOT NULL DEFAULT 0,
  computed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  extra          JSONB       NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(run_id, model_name, horizon_days)
);

-- forecast_backtest_predictions: 個々の予測点レベルの実績比較
-- UIで「どの時点でどれだけ外したか」を可視化したい場合に使用
CREATE TABLE IF NOT EXISTS forecast_backtest_predictions (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id               UUID        NOT NULL REFERENCES forecast_backtest_runs(id) ON DELETE CASCADE,
  model_name           TEXT        NOT NULL,
  forecast_origin_date DATE        NOT NULL,  -- 予測を行った起点日
  target_date          DATE        NOT NULL,  -- 予測対象日
  horizon_days         INT         NOT NULL,
  predicted_weight     NUMERIC     NOT NULL,
  actual_weight        NUMERIC     NOT NULL,
  error                NUMERIC     NOT NULL,  -- predicted - actual
  abs_error            NUMERIC     NOT NULL,
  squared_error        NUMERIC     NOT NULL,
  ape                  NUMERIC,               -- |error / actual| * 100 (%)
  UNIQUE(run_id, model_name, forecast_origin_date, target_date)
);

-- RLS: anon は読み取りのみ、service_role は全操作
ALTER TABLE forecast_backtest_runs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE forecast_backtest_metrics     ENABLE ROW LEVEL SECURITY;
ALTER TABLE forecast_backtest_predictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon can read forecast_backtest_runs"
  ON forecast_backtest_runs FOR SELECT TO anon USING (true);
CREATE POLICY "service_role full access forecast_backtest_runs"
  ON forecast_backtest_runs FOR ALL TO service_role USING (true);

CREATE POLICY "anon can read forecast_backtest_metrics"
  ON forecast_backtest_metrics FOR SELECT TO anon USING (true);
CREATE POLICY "service_role full access forecast_backtest_metrics"
  ON forecast_backtest_metrics FOR ALL TO service_role USING (true);

CREATE POLICY "anon can read forecast_backtest_predictions"
  ON forecast_backtest_predictions FOR SELECT TO anon USING (true);
CREATE POLICY "service_role full access forecast_backtest_predictions"
  ON forecast_backtest_predictions FOR ALL TO service_role USING (true);

-- インデックス: UIで最新runを取得するクエリ用
CREATE INDEX IF NOT EXISTS idx_backtest_runs_created_at
  ON forecast_backtest_runs(created_at DESC);

-- インデックス: run_id で metrics を引くクエリ用
CREATE INDEX IF NOT EXISTS idx_backtest_metrics_run_id
  ON forecast_backtest_metrics(run_id);

-- インデックス: run_id で predictions を引くクエリ用
CREATE INDEX IF NOT EXISTS idx_backtest_predictions_run_id
  ON forecast_backtest_predictions(run_id);
