-- daily_logs に updated_at を追加し、過去日の行修正でも analytics stale 判定が機能するようにする
--
-- 問題:
--   旧実装の stale 判定は latestRawLogDate (= MAX(log_date)) を基準にしていた。
--   過去日の行を修正しても MAX(log_date) は変わらないため、
--   analytics cache が実質 stale でも fresh 扱いのまま残っていた。
--
-- 解決策:
--   updated_at (行の最終更新日時) を追加し、MAX(updated_at) を stale 判定基準にする。
--   行が INSERT または UPDATE されるたびに updated_at を NOW() で更新するトリガーを設置する。
--
-- 既存行の扱い:
--   既存行は updated_at = NOW() (migration 実行時) でバックフィルされる。
--   初回 migration 直後は MAX(updated_at) が "今日" になるため、
--   analytics_cache.updated_at が "今日" より古ければ stale 判定になる。
--   これは「過去に何らかの更新があった可能性があり、再計算すべき」として正しい挙動である。

-- 1. カラム追加（既存行は NOW() でバックフィル）
ALTER TABLE daily_logs
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now() NOT NULL;

-- 2. 自動更新トリガー関数
CREATE OR REPLACE FUNCTION update_daily_logs_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- 3. BEFORE UPDATE トリガー（INSERT は DEFAULT now() でカバー済み）
DROP TRIGGER IF EXISTS daily_logs_set_updated_at ON daily_logs;
CREATE TRIGGER daily_logs_set_updated_at
  BEFORE UPDATE ON daily_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_daily_logs_updated_at();

COMMENT ON COLUMN daily_logs.updated_at IS
  '行の最終更新日時。INSERT 時は DEFAULT now()、UPDATE 時はトリガーで自動設定される。
   analytics stale 判定の基準として MAX(updated_at) を使用する。
   MAX(log_date) ベースの判定では過去日の行修正を検知できないため、このカラムで代替する。';
