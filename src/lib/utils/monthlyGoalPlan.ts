/**
 * monthlyGoalPlan.ts
 *
 * 月次目標体重計画の canonical logic。
 *
 * ## 月次目標の定義
 * - targetWeight は「その月末時点の目標体重」として扱う。
 *   月別サマリー・月末実績と対応づけやすく、月単位の計画として最も自然な単位。
 *
 * ## 計画の範囲
 * - currentMonth (today の YYYY-MM) から deadlineMonth (goalDeadlineDate の YYYY-MM) まで。
 * - 過去月 (currentMonth より前) はこの計画に含めない。
 *   過去実績は monthlyActuals として入力され、表示用に actualWeight へ記録する。
 *
 * ## 再配分ルール
 * - override を「アンカー」として扱い、アンカー間を線形補間で均等配分する。
 * - 最終月は必ず finalGoalWeight (アンカーとして固定)。
 * - 最終月への override は無視し、常に finalGoalWeight を使う。
 *
 * ## Error / Warning の使い分け
 * - Error: 計画を構築できない状態 (不正入力 / 期限が過去 / 計画対象月ゼロ など)。
 * - Warning: 計画は構築できるが注意が必要な状態 (過大な月間変化量 / 残り月数不足 など)。
 *
 * ## 警告閾値
 * - HIGH_MONTHLY_DELTA: 2.0 kg/month ≈ 1.0 kg/2週。
 *   持続可能な脂肪燃焼速度の上限目安として設定。
 *   既存アプリに明示的な月間閾値がないため本ファイルで定数化する。
 */

// ─── 警告閾値定数 ────────────────────────────────────────────────────────────

/**
 * 月間変化量の警告閾値 (kg/month の絶対値)。
 * 2.0 kg/month ≈ 1.0 kg/2週 = 体重管理における持続可能な上限目安。
 */
export const MAX_SAFE_MONTHLY_DELTA_KG = 2.0;

/**
 * 残り月数が少ない場合の警告閾値。
 * 期限が今月のみ (残り 1 ヶ月以下) のとき DEADLINE_TOO_CLOSE を発する。
 */
const DEADLINE_TOO_CLOSE_MONTHS = 1;

// ─── 型定義 ──────────────────────────────────────────────────────────────────

/** 月次目標の出どころ */
export type MonthlyTargetSource =
  | "actual_fixed"        // 過去月: 実績で固定済み（未来実装用に型だけ定義）
  | "manual"              // ユーザーが手動編集した値
  | "auto_redistributed"; // 再配分アルゴリズムで自動計算

/** 月次計画の 1 エントリー */
export interface MonthlyGoalEntry {
  /** "YYYY-MM" */
  month: string;
  /** 月末体重目標 (kg)。精度は 0.1 kg。 */
  targetWeight: number;
  source: MonthlyTargetSource;
  /**
   * 前月末体重比の変化量 (kg)。
   * Cut なら負値、Bulk なら正値、0 は変化なし。
   * 初月は currentWeight 比。
   */
  requiredDeltaKg: number;
  /**
   * 実際の月末体重 (kg)。
   * 過去月で dailyLogs に記録があれば入る。null = 未記録または未来月。
   */
  actualWeight: number | null;
}

/** ユーザーが手動編集した月次 override */
export interface MonthlyGoalOverride {
  /** "YYYY-MM" */
  month: string;
  /** ユーザーが指定した月末目標体重 (kg) */
  targetWeight: number;
}

/** 月次実績 (daily_logs の集計として渡される) */
export interface MonthlyActual {
  /** "YYYY-MM" */
  month: string;
  /** 月内最終記録体重 (kg)。null = 記録なし */
  endWeight: number | null;
}

/** buildMonthlyGoalPlan への入力 */
export interface MonthlyGoalPlanInput {
  /**
   * 現在体重 (kg)。
   * 7日平均推奨。なければ最新の daily_logs weight。
   */
  currentWeight: number;
  /** 今日の日付 "YYYY-MM-DD" (JST)。toJstDateStr() の値を渡すこと。 */
  today: string;
  /** 最終目標体重 (kg)。settings.targetWeight に対応。 */
  finalGoalWeight: number;
  /** 大会・目標期限 "YYYY-MM-DD"。settings.contestDate に対応。 */
  goalDeadlineDate: string;
  /** 月次実績リスト (daily_logs から集計済み)。空配列可。 */
  monthlyActuals: MonthlyActual[];
  /** ユーザーが手動編集した月次 override リスト。空配列 = 自動均等配分。 */
  overrides: MonthlyGoalOverride[];
}

/** バリデーション/不整合エラーコード (plan が構築不可な状態) */
export type MonthlyGoalErrorCode =
  | "INVALID_DEADLINE"            // goalDeadlineDate が不正な日付形式
  | "INVALID_CURRENT_WEIGHT"      // currentWeight が数値でない / 範囲外
  | "INVALID_GOAL_WEIGHT"         // finalGoalWeight が数値でない / 範囲外
  | "DEADLINE_IN_PAST"            // 期限月が currentMonth より過去
  | "NO_MONTHS"                   // 計画対象月が 0 件 (内部エラー)
  | "OVERRIDE_MONTH_OUT_OF_RANGE"; // override が計画期間外の月を指している

/** バリデーションエラー。isValid=false の場合に entries は空。 */
export interface MonthlyGoalError {
  code: MonthlyGoalErrorCode;
}

/** 警告コード (plan は構築可能だが注意が必要な状態) */
export type MonthlyGoalWarningCode =
  | "HIGH_MONTHLY_DELTA"    // ある月の |requiredDeltaKg| が閾値超え
  | "DEADLINE_TOO_CLOSE"    // 残り計画月数が DEADLINE_TOO_CLOSE_MONTHS 以下
  | "MANUAL_GOAL_MISMATCH"  // override の結果が finalGoalWeight に収束しない
  | "ALREADY_AT_GOAL"       // 現在体重が既に最終目標以下 (Cut) または以上 (Bulk)
  | "WRONG_DIRECTION";      // ある月の delta が最終目標と逆方向

/** 警告。plan は構築可能だが呼び出し元で注意を促すべき状態。 */
export interface MonthlyGoalWarning {
  code: MonthlyGoalWarningCode;
  /** 警告が発生した月 "YYYY-MM" (月単位で特定できる場合) */
  month?: string;
  /** 問題のある数値 (例: 超過した delta 量) */
  value?: number;
  /** 比較に使った閾値 */
  threshold?: number;
}

/** buildMonthlyGoalPlan / validateMonthlyGoalPlan の出力 */
export interface MonthlyGoalPlan {
  entries: MonthlyGoalEntry[];
  isValid: boolean;
  errors: MonthlyGoalError[];
  warnings: MonthlyGoalWarning[];
}

// ─── Private ヘルパー ─────────────────────────────────────────────────────────

/**
 * "YYYY-MM-DD" または "YYYY-MM" から "YYYY-MM" を返す。
 * 不正な文字列でも先頭 7 文字を返す（バリデーションは呼び出し元で済んでいる前提）。
 */
function toYearMonth(dateStr: string): string {
  return dateStr.slice(0, 7);
}

/**
 * fromMonth から toMonth まで (両端含む) の "YYYY-MM" リストを返す。
 * fromMonth > toMonth の場合は空配列。
 */
function buildMonthRange(fromMonth: string, toMonth: string): string[] {
  const months: string[] = [];
  const [fy, fm] = fromMonth.split("-").map(Number);
  const [ty, tm] = toMonth.split("-").map(Number);
  let y = fy!;
  let m = fm!;
  const endY = ty!;
  const endM = tm!;
  while (y < endY || (y === endY && m <= endM)) {
    months.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return months;
}

/** 前月末体重と今月目標体重から requiredDeltaKg を計算する。精度 0.01 kg。 */
function calcRequiredDelta(prevWeight: number, targetWeight: number): number {
  return Math.round((targetWeight - prevWeight) * 100) / 100;
}

/**
 * 入力バリデーション。
 * エラーがなければ空配列を返す。
 * 致命的エラー (INVALID_DEADLINE) は以降の検証をスキップする。
 */
function validateInput(input: MonthlyGoalPlanInput): MonthlyGoalError[] {
  const errors: MonthlyGoalError[] = [];

  if (
    !input.goalDeadlineDate ||
    !/^\d{4}-\d{2}-\d{2}$/.test(input.goalDeadlineDate)
  ) {
    errors.push({ code: "INVALID_DEADLINE" });
    return errors; // 日付依存の検証はスキップ
  }

  if (
    !isFinite(input.currentWeight) ||
    input.currentWeight <= 0 ||
    input.currentWeight > 300
  ) {
    errors.push({ code: "INVALID_CURRENT_WEIGHT" });
  }

  if (
    !isFinite(input.finalGoalWeight) ||
    input.finalGoalWeight <= 0 ||
    input.finalGoalWeight > 300
  ) {
    errors.push({ code: "INVALID_GOAL_WEIGHT" });
  }

  if (errors.length > 0) return errors;

  const todayMonth = toYearMonth(input.today);
  const deadlineMonth = toYearMonth(input.goalDeadlineDate);

  if (deadlineMonth < todayMonth) {
    errors.push({ code: "DEADLINE_IN_PAST" });
  }

  return errors;
}

// ─── Exported 関数 ────────────────────────────────────────────────────────────

/**
 * 月次目標計画を構築する。
 *
 * 以下の優先順位で各月の targetWeight を決める:
 * 1. override がある月 → override 値 (source: "manual")
 * 2. 最終月 → finalGoalWeight (source: "auto_redistributed")
 * 3. それ以外 → 直前アンカーから次アンカーへの線形補間 (source: "auto_redistributed")
 *
 * アンカー: [currentWeight (起点), ...overrides..., finalGoalWeight (終点)]
 */
export function buildMonthlyGoalPlan(
  input: MonthlyGoalPlanInput
): MonthlyGoalPlan {
  const errors = validateInput(input);
  if (errors.length > 0) {
    return { entries: [], isValid: false, errors, warnings: [] };
  }

  const todayMonth = toYearMonth(input.today);
  const deadlineMonth = toYearMonth(input.goalDeadlineDate);
  const months = buildMonthRange(todayMonth, deadlineMonth);

  if (months.length === 0) {
    return {
      entries: [],
      isValid: false,
      errors: [{ code: "NO_MONTHS" }],
      warnings: [],
    };
  }

  // override が計画期間外を指していないか検証
  const outOfRange = input.overrides.filter(
    (o) => o.month < todayMonth || o.month > deadlineMonth
  );
  if (outOfRange.length > 0) {
    return {
      entries: [],
      isValid: false,
      errors: [{ code: "OVERRIDE_MONTH_OUT_OF_RANGE" }],
      warnings: [],
    };
  }

  // override map (最終月への override は無視して finalGoalWeight で上書き)
  const lastMonth = months[months.length - 1]!;
  const overrideMap = new Map<string, number>(
    input.overrides
      .filter((o) => o.month !== lastMonth)
      .map((o) => [o.month, o.targetWeight])
  );

  // actual map
  const actualMap = new Map<string, number | null>(
    input.monthlyActuals.map((a) => [a.month, a.endWeight])
  );

  // アンカー: index ベースで管理 (idx=-1 = 起点 currentWeight)
  type Anchor = { idx: number; weight: number };
  const anchors: Anchor[] = [{ idx: -1, weight: input.currentWeight }];
  months.forEach((month, idx) => {
    if (overrideMap.has(month)) {
      anchors.push({ idx, weight: overrideMap.get(month)! });
    }
  });
  // 終点アンカー: 最終月は常に finalGoalWeight
  anchors.push({ idx: months.length - 1, weight: input.finalGoalWeight });

  // 各月のエントリーを構築
  const entries: MonthlyGoalEntry[] = [];

  for (let i = 0; i < months.length; i++) {
    const month = months[i]!;
    const actual = actualMap.get(month) ?? null;

    // 前後アンカーを探す
    const prevAnchor = [...anchors].filter((a) => a.idx < i).at(-1)!;
    const nextAnchor = anchors.find((a) => a.idx >= i)!;

    let targetWeight: number;
    let source: MonthlyTargetSource;

    if (nextAnchor.idx === i) {
      // このインデックス自体がアンカー (override または最終月)
      targetWeight = nextAnchor.weight;
      source = overrideMap.has(month) ? "manual" : "auto_redistributed";
    } else {
      // 前後アンカー間の線形補間
      const stepInSegment = i - prevAnchor.idx;
      const totalSteps = nextAnchor.idx - prevAnchor.idx;
      const t = stepInSegment / totalSteps;
      const raw =
        prevAnchor.weight + t * (nextAnchor.weight - prevAnchor.weight);
      targetWeight = Math.round(raw * 10) / 10;
      source = "auto_redistributed";
    }

    const prevWeight =
      i === 0 ? input.currentWeight : entries[i - 1]!.targetWeight;

    entries.push({
      month,
      targetWeight,
      source,
      requiredDeltaKg: calcRequiredDelta(prevWeight, targetWeight),
      actualWeight: actual,
    });
  }

  const warnings = getMonthlyGoalWarnings({
    entries,
    currentWeight: input.currentWeight,
    finalGoalWeight: input.finalGoalWeight,
    today: input.today,
  });

  return { entries, isValid: true, errors: [], warnings };
}

/**
 * 編集月を起点に、翌月以降を均等再配分する。
 *
 * - 編集月より前: 変更なし
 * - 編集月: newTargetWeight に更新 (source: "manual")
 * - 編集月の翌月以降: newTargetWeight から finalGoalWeight まで線形補間で再配分
 *   (既存の manual override も auto_redistributed に上書きされる)
 *
 * @param entries 現在の月次計画エントリーリスト
 * @param editedMonth 編集した月 "YYYY-MM"
 * @param newTargetWeight 編集月の新しい月末目標体重 (kg)
 * @param finalGoalWeight 最終目標体重 (kg)
 * @returns 再配分後の新しいエントリーリスト。editedMonth が見つからない場合は元のリストをそのまま返す。
 */
export function redistributeMonthlyGoals(
  entries: MonthlyGoalEntry[],
  editedMonth: string,
  newTargetWeight: number,
  finalGoalWeight: number
): MonthlyGoalEntry[] {
  const editedIdx = entries.findIndex((e) => e.month === editedMonth);
  if (editedIdx === -1) return entries;

  // 最終月は編集不可 (finalGoalWeight が唯一の正規値)
  if (editedIdx === entries.length - 1) return entries;

  const before = entries.slice(0, editedIdx);
  const prevWeight =
    editedIdx > 0 ? entries[editedIdx - 1]!.targetWeight : newTargetWeight;

  const editedEntry: MonthlyGoalEntry = {
    ...entries[editedIdx]!,
    targetWeight: newTargetWeight,
    source: "manual",
    requiredDeltaKg: calcRequiredDelta(prevWeight, newTargetWeight),
  };

  const afterEntries = entries.slice(editedIdx + 1);
  const afterCount = afterEntries.length;

  if (afterCount === 0) {
    return [...before, editedEntry];
  }

  // 翌月以降を newTargetWeight → finalGoalWeight で線形補間
  let runningPrev = newTargetWeight;
  const redistributed: MonthlyGoalEntry[] = afterEntries.map((orig, j) => {
    const stepInSegment = j + 1;
    const totalSteps = afterCount;
    const t = stepInSegment / totalSteps;
    const raw = newTargetWeight + t * (finalGoalWeight - newTargetWeight);
    const tgt = Math.round(raw * 10) / 10;

    const entry: MonthlyGoalEntry = {
      month: orig.month,
      targetWeight: tgt,
      source: "auto_redistributed",
      requiredDeltaKg: calcRequiredDelta(runningPrev, tgt),
      actualWeight: orig.actualWeight,
    };
    runningPrev = tgt;
    return entry;
  });

  return [...before, editedEntry, ...redistributed];
}

/**
 * 月次計画と最終目標 / 期限との整合を判定する。
 *
 * buildMonthlyGoalPlan 後または手動 redistribute 後の検証に使う。
 * isValid=false の plan を渡した場合はその errors をそのまま返す。
 */
export function validateMonthlyGoalPlan(
  plan: MonthlyGoalPlan,
  input: Pick<
    MonthlyGoalPlanInput,
    "currentWeight" | "finalGoalWeight" | "goalDeadlineDate" | "today"
  >
): MonthlyGoalPlan {
  if (!plan.isValid) return plan;

  const errors: MonthlyGoalError[] = [];
  const deadlineMonth = toYearMonth(input.goalDeadlineDate);
  const lastEntry = plan.entries.at(-1);

  // 最終エントリーが期限月と一致するか
  if (!lastEntry || lastEntry.month !== deadlineMonth) {
    errors.push({ code: "OVERRIDE_MONTH_OUT_OF_RANGE" });
  }

  // 最終エントリーの targetWeight が finalGoalWeight と一致するか (0.05 kg 以内)
  if (lastEntry && Math.abs(lastEntry.targetWeight - input.finalGoalWeight) > 0.05) {
    errors.push({ code: "INVALID_GOAL_WEIGHT" });
  }

  if (errors.length > 0) {
    return { ...plan, isValid: false, errors };
  }

  // 整合している場合は warnings を再計算して返す
  const warnings = getMonthlyGoalWarnings({
    entries: plan.entries,
    currentWeight: input.currentWeight,
    finalGoalWeight: input.finalGoalWeight,
    today: input.today,
  });

  return { ...plan, isValid: true, errors: [], warnings };
}

/**
 * 月次計画エントリーに対して警告を計算して返す。
 *
 * buildMonthlyGoalPlan / validateMonthlyGoalPlan から内部的に呼ばれるが、
 * 呼び出し元が単独で使うこともできる。
 */
export function getMonthlyGoalWarnings(input: {
  entries: MonthlyGoalEntry[];
  currentWeight: number;
  finalGoalWeight: number;
  today: string;
}): MonthlyGoalWarning[] {
  const warnings: MonthlyGoalWarning[] = [];
  const { entries, currentWeight, finalGoalWeight, today } = input;

  if (entries.length === 0) return warnings;

  const todayMonth = toYearMonth(today);

  // ── ALREADY_AT_GOAL ──
  // 誤差 0.2 kg 以内を「達成済み」と判定 (calcReadiness の実績値に倣う)。
  // 浮動小数点誤差を避けるため diff は 0.01 kg 単位で丸めてから比較する。
  const GOAL_TOLERANCE = 0.2;
  const isCut = finalGoalWeight < currentWeight;
  const isBulk = finalGoalWeight > currentWeight;
  // diff = currentWeight − finalGoalWeight (正: 目標より重い, 負: 目標より軽い)
  const diff = Math.round((currentWeight - finalGoalWeight) * 100) / 100;
  // Cut: diff ≤ tolerance → 目標以下 (達成 or 超過)
  // Bulk: diff ≥ −tolerance → 目標以上 (達成 or 超過)
  // 方向なし (goal === current): |diff| ≤ tolerance
  const isAlreadyAtGoal = isCut
    ? diff <= GOAL_TOLERANCE
    : isBulk
      ? diff >= -GOAL_TOLERANCE
      : Math.abs(diff) <= GOAL_TOLERANCE;

  if (isAlreadyAtGoal) {
    warnings.push({ code: "ALREADY_AT_GOAL" });
  }

  // ── DEADLINE_TOO_CLOSE ──
  // 今月以降の計画エントリーが閾値以下
  const futureEntries = entries.filter((e) => e.month >= todayMonth);
  if (futureEntries.length <= DEADLINE_TOO_CLOSE_MONTHS) {
    warnings.push({ code: "DEADLINE_TOO_CLOSE" });
  }

  // ── HIGH_MONTHLY_DELTA / WRONG_DIRECTION ──
  for (const entry of entries) {
    const absD = Math.abs(entry.requiredDeltaKg);

    if (absD > MAX_SAFE_MONTHLY_DELTA_KG) {
      warnings.push({
        code: "HIGH_MONTHLY_DELTA",
        month: entry.month,
        value: absD,
        threshold: MAX_SAFE_MONTHLY_DELTA_KG,
      });
    }

    // 方向チェック: delta の符号が目標方向と逆の場合
    // Cut: delta > 0 は逆方向 / Bulk: delta < 0 は逆方向
    // delta === 0 は方向チェックの対象外
    if (
      entry.requiredDeltaKg !== 0 &&
      ((isCut && entry.requiredDeltaKg > 0) ||
        (isBulk && entry.requiredDeltaKg < 0))
    ) {
      warnings.push({ code: "WRONG_DIRECTION", month: entry.month });
    }
  }

  // ── MANUAL_GOAL_MISMATCH ──
  // 手動 override が含まれ、かつ最終エントリーが finalGoalWeight に収束していない場合
  const hasManual = entries.some((e) => e.source === "manual");
  const lastEntry = entries.at(-1);
  if (
    hasManual &&
    lastEntry &&
    Math.abs(lastEntry.targetWeight - finalGoalWeight) > 0.05
  ) {
    warnings.push({ code: "MANUAL_GOAL_MISMATCH" });
  }

  return warnings;
}
