-- sleep_sessions テーブル作成 (#515)
--
-- 目的:
--   睡眠記録の source of truth を daily_logs.bed_time / sleep_hours から
--   sleep_sessions テーブルへ移行する。1行 = 1回の就寝〜起床セッション。
--
-- 設計:
--   - bed_at / wake_at は TIMESTAMPTZ (日付+時刻+タイムゾーン) で保存
--     → TIME 型の日付曖昧性（前日夜 vs 当日深夜）を解消する
--   - wake_date は起床日 (DATE)。daily_logs.log_date との結合キー
--   - UNIQUE (wake_date) で主睡眠 1件制約 (将来の nap 対応時に外す)
--   - source カラムで手動入力 / 外部インポートを区別する
--
-- daily_logs.sleep_hours との関係:
--   - sync_sleep_hours_to_daily_logs トリガーが sleep_sessions の変更を
--     daily_logs.sleep_hours に自動反映する (projection 値として維持)
--   - daily_logs.bed_time は移行期カラムとして DB に残存するが、
--     saveDailyLog からの新規書き込みは行わない
--
-- 将来拡張:
--   - nap 対応時: UNIQUE (wake_date) を外し session_type ('main'|'nap') を追加
--   - Apple Health インポート: source = 'apple_health' で区別
--
-- 参照: docs/sleep-sessions-model-spec.md

-- ── テーブル作成 ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sleep_sessions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  wake_date   DATE        NOT NULL,
  bed_at      TIMESTAMPTZ NOT NULL,
  wake_at     TIMESTAMPTZ NOT NULL,
  source      TEXT        NOT NULL DEFAULT 'manual'
                          CHECK (source IN ('manual', 'apple_health')),
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- bed_at < wake_at を保証する
  CONSTRAINT chk_sleep_sessions_order CHECK (bed_at < wake_at),

  -- wake_date ごとに主睡眠は 1件のみ (将来の nap 対応時に外す)
  CONSTRAINT uq_sleep_sessions_wake_date UNIQUE (wake_date)
);

COMMENT ON TABLE sleep_sessions IS
  '睡眠セッション。1行 = 1回の就寝〜起床。wake_date で daily_logs と JOIN する。
   source of truth は sleep_sessions。daily_logs.sleep_hours は projection 値 (トリガーで同期)。';
COMMENT ON COLUMN sleep_sessions.id        IS 'UUID PK。';
COMMENT ON COLUMN sleep_sessions.wake_date IS '起床日 (JST DATE)。daily_logs.log_date と同値。UNIQUE で主睡眠 1件制約。';
COMMENT ON COLUMN sleep_sessions.bed_at    IS '就寝日時 (TIMESTAMPTZ)。JST +09:00 で入力して DB は UTC で保存する。';
COMMENT ON COLUMN sleep_sessions.wake_at   IS '起床日時 (TIMESTAMPTZ)。DATE(wake_at AT TIME ZONE Asia/Tokyo) = wake_date を満たすこと。';
COMMENT ON COLUMN sleep_sessions.source    IS '入力元。manual = MealLogger 手動入力 / apple_health = 外部インポート。';
COMMENT ON COLUMN sleep_sessions.note      IS '任意メモ。';
COMMENT ON COLUMN sleep_sessions.created_at IS '作成日時 (UTC)。';
COMMENT ON COLUMN sleep_sessions.updated_at IS '最終更新日時 (UTC)。';

-- ── updated_at 自動更新トリガー ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at_sleep_sessions()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_updated_at_sleep_sessions
BEFORE UPDATE ON sleep_sessions
FOR EACH ROW EXECUTE FUNCTION set_updated_at_sleep_sessions();

-- ── daily_logs.sleep_hours への projection トリガー ────────────────────────────
--
-- sleep_sessions の INSERT / UPDATE / DELETE 時に daily_logs.sleep_hours を更新する。
-- これにより daily_logs.sleep_hours は sleep_sessions から派生した projection 値になる。
--
-- 計算式:
--   sleep_hours = ROUND(EXTRACT(EPOCH FROM (wake_at - bed_at)) / 3600.0, 1)
--
-- 対応する daily_logs 行がない場合は UPDATE が 0 行にヒットするだけで
-- エラーにならない (sleep_sessions と daily_logs は外部キーで結合しない)。

CREATE OR REPLACE FUNCTION sync_sleep_hours_to_daily_logs()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- セッション削除 → sleep_hours を NULL に戻す
    UPDATE daily_logs
    SET sleep_hours = NULL
    WHERE log_date = OLD.wake_date;
    RETURN OLD;
  ELSE
    -- INSERT / UPDATE → sleep_hours を再計算して書き込む
    UPDATE daily_logs
    SET sleep_hours = ROUND(
      EXTRACT(EPOCH FROM (NEW.wake_at - NEW.bed_at)) / 3600.0,
      1
    )::NUMERIC
    WHERE log_date = NEW.wake_date;
    RETURN NEW;
  END IF;
END;
$$;

COMMENT ON FUNCTION sync_sleep_hours_to_daily_logs() IS
  'sleep_sessions の INSERT/UPDATE/DELETE 後に daily_logs.sleep_hours を同期する。
   sleep_hours は (wake_at - bed_at) の時間差 (h, 小数点 1 桁)。
   対応する daily_logs 行がなければ UPDATE 0 行で無害に終了する。';

CREATE TRIGGER trg_sync_sleep_hours
AFTER INSERT OR UPDATE OR DELETE ON sleep_sessions
FOR EACH ROW EXECUTE FUNCTION sync_sleep_hours_to_daily_logs();

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- 既存テーブルと同じ方針: anon キーで全操作を許可する

ALTER TABLE sleep_sessions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "anon can select sleep_sessions"
    ON sleep_sessions FOR SELECT TO anon USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "anon can insert sleep_sessions"
    ON sleep_sessions FOR INSERT TO anon WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "anon can update sleep_sessions"
    ON sleep_sessions FOR UPDATE TO anon USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "anon can delete sleep_sessions"
    ON sleep_sessions FOR DELETE TO anon USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
