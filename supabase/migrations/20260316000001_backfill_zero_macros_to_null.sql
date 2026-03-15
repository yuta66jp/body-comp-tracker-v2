-- 未記録由来の 0 データを NULL に補正する
--
-- 背景:
--   旧保存経路（MealLogger + RPC 導入以前）では、食事記録を付けていない日の
--   calories / protein / fat / carbs が NULL ではなく 0 で保存されていた。
--   例: log_date = 2025-11-23, weight = 73.60, calories = 0, protein = 0.0, fat = 0.0, carbs = 0.0
--
-- 問題:
--   0 は「実際に 0 kcal / 0g を摂取した日（絶食日）」という実測値として解釈される。
--   未記録の 0 を実測値として扱うと以下のノイズが生じる:
--     - enrich.py: tdee_estimated = 0 - weight_sma7_delta * 7200 → 大幅に過小な TDEE 推定
--     - analyze.py: dropna で除外されず、XGBoost の特徴量に 0 カロリーの絶食日として混入
--     - calcMacro.ts: avgCalories の平均にゼロ日が含まれ実際より低い値になる
--
-- 補正条件の根拠:
--   calories / protein / fat / carbs が【全て同時に 0】の場合を「未記録由来」と判断する。
--   4 列が全て 0 になるのは「何も食べなかった実測値」ではなく「記録なし」の強い指標。
--   1 列でも非ゼロならば記録済みとして扱い補正しない。
--
-- 補正後の意味論:
--   NULL = 未記録・不明（欠損値）
--   0    = 実測値（絶食日など、今後の現行保存経路から保存されたもの）
--
-- 現行保存経路（MealLogger → save_daily_log_partial RPC）は:
--   食事未入力 → calories: undefined → JSONB にキーなし → INSERT で NULL
--   食事入力あり → calories: totals.calories (0 以上の実測値)
-- のため、この migration 適用後は未記録 0 の再発生は防がれている。

UPDATE daily_logs
SET
  calories = NULL,
  protein  = NULL,
  fat      = NULL,
  carbs    = NULL
WHERE
  calories = 0
  AND protein  = 0
  AND fat      = 0
  AND carbs    = 0;
