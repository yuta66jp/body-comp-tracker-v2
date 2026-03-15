-- daily_logs_training_type_check に 'off' を追加する
--
-- 問題:
--   アプリ側の TRAINING_TYPES には 'off' が含まれており、
--   isValidTrainingType('off') も true を返す。
--   しかし DB の CHECK 制約には 'off' が含まれていなかったため、
--   training_type = 'off' を保存しようとすると
--   "violates check constraint daily_logs_training_type_check" エラーが発生していた。
--
-- 修正内容:
--   既存の制約を DROP して、'off' を含む新しい制約に置き換える。
--   NULL は元の制約でも暗黙的に許容されており（CHECK は NULL に対して UNKNOWN を返し通過する）、
--   新制約でも同様に NULL を許容する。
--
-- 許可値（アプリ側 TRAINING_TYPES と一致させる）:
--   off / chest / back / shoulders / glutes_hamstrings / quads

ALTER TABLE daily_logs
  DROP CONSTRAINT IF EXISTS daily_logs_training_type_check;

ALTER TABLE daily_logs
  ADD CONSTRAINT daily_logs_training_type_check
    CHECK (training_type IN ('off', 'chest', 'back', 'shoulders', 'glutes_hamstrings', 'quads'));
