-- 既存 sleep_sessions → daily_logs.weigh_in_time の一括 backfill (#526)
--
-- 目的:
--   20260409000000 で追加したトリガー (trg_sync_weigh_in_time) は
--   今後の sleep_sessions INSERT/UPDATE を同期するが、
--   migration 適用前に保存済みの sleep_sessions は同期されていない。
--   ここで既存レコードをすべて一括同期する。
--
-- 動作:
--   sleep_sessions に対応する wake_date をもつ daily_logs の行について
--   weigh_in_time = wake_at (JST) の TIME 値 を設定する。
--   対応する sleep_sessions がない daily_logs 行には触れない（NULL のまま）。

UPDATE daily_logs dl
SET weigh_in_time = (
  SELECT (ss.wake_at AT TIME ZONE 'Asia/Tokyo')::TIME
  FROM sleep_sessions ss
  WHERE ss.wake_date = dl.log_date
)
WHERE EXISTS (
  SELECT 1
  FROM sleep_sessions ss
  WHERE ss.wake_date = dl.log_date
);
