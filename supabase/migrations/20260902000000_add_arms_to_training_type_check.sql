-- daily_logs.training_type に腕トレーニングを表す 'arms' を追加する。
-- アプリ側の TRAINING_TYPES と DB CHECK 制約の許可値を一致させる。

ALTER TABLE daily_logs
  DROP CONSTRAINT IF EXISTS daily_logs_training_type_check;

ALTER TABLE daily_logs
  ADD CONSTRAINT daily_logs_training_type_check
    CHECK (training_type IN (
      'off',
      'chest',
      'back',
      'shoulders',
      'arms',
      'glutes_hamstrings',
      'quads'
    ));

COMMENT ON COLUMN daily_logs.training_type
  IS 'トレーニング部位: off/chest/back/shoulders/arms/glutes_hamstrings/quads';
