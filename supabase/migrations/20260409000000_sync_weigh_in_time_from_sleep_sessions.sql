-- daily_logs.weigh_in_time を sleep_sessions.wake_at から自動同期するトリガー (#526)
--
-- 目的:
--   体重測定時刻 (weigh_in_time) を廃止し、起床時刻へ統合する。
--   「体重は常に起床直後に測定する」という運用前提のもと、
--   朝の基準時刻の source of truth を sleep_sessions.wake_at に一本化する。
--
--   これにより daily_logs.weigh_in_time は手動入力列ではなく、
--   sleep_sessions.wake_at から派生した projection 値となる。
--   (sleep_hours の trg_sync_sleep_hours と同じパターン)
--
-- 動作:
--   INSERT / UPDATE: wake_at を JST (Asia/Tokyo) に変換し TIME として weigh_in_time に書き込む
--   DELETE: weigh_in_time を NULL に戻す
--
-- 対応する daily_logs 行がない場合は UPDATE 0 行で無害に終了する。

CREATE OR REPLACE FUNCTION sync_weigh_in_time_from_sleep_sessions()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE daily_logs
    SET weigh_in_time = NULL
    WHERE log_date = OLD.wake_date;
    RETURN OLD;
  ELSE
    -- wake_at (TIMESTAMPTZ) を JST に変換して TIME として保存
    UPDATE daily_logs
    SET weigh_in_time = (NEW.wake_at AT TIME ZONE 'Asia/Tokyo')::TIME
    WHERE log_date = NEW.wake_date;
    RETURN NEW;
  END IF;
END;
$$;

COMMENT ON FUNCTION sync_weigh_in_time_from_sleep_sessions() IS
  'sleep_sessions の INSERT/UPDATE/DELETE 後に daily_logs.weigh_in_time を同期する。
   weigh_in_time = wake_at を JST (Asia/Tokyo) に変換した TIME 値。
   断食時間算出 (calcFastingHours) に使用する。
   対応する daily_logs 行がなければ UPDATE 0 行で無害に終了する。';

CREATE TRIGGER trg_sync_weigh_in_time
AFTER INSERT OR UPDATE OR DELETE ON sleep_sessions
FOR EACH ROW EXECUTE FUNCTION sync_weigh_in_time_from_sleep_sessions();
