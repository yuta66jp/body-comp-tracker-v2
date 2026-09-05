-- #782 本番に残る DEFAULT 0 を、食事未記録の NULL 意味論に合わせる。
-- 体重のみの INSERT / upsert でも 0 kcal 禁止制約に違反しないようにする。
-- 初期値だけを変更し、既存の食事記録と CHECK 制約は保持する。

ALTER TABLE public.daily_logs
  ALTER COLUMN calories SET DEFAULT NULL,
  ALTER COLUMN protein SET DEFAULT NULL,
  ALTER COLUMN fat SET DEFAULT NULL,
  ALTER COLUMN carbs SET DEFAULT NULL;
