/**
 * backtestExclusion.ts のユニットテスト
 *
 * Python の build_exclusion_dates() と同等の動作を検証する。
 */

import {
  buildExclusionList,
  parseRunConfig,
  type ExcludedDateEntry,
} from "./backtestExclusion";
import type { Json } from "@/lib/supabase/types";

// ── parseRunConfig ────────────────────────────────────────────────────────

describe("parseRunConfig", () => {
  it("正常な config から各フィールドを抽出できる", () => {
    const config: Json = {
      recovery_days: 3,
      manual_event_periods: [
        { start: "2026-02-01", end: "2026-02-05" },
      ],
      eval_policies: ["all_days", "exclude_flagged_plus_recovery"],
    };
    const result = parseRunConfig(config);
    expect(result.recoveryDays).toBe(3);
    expect(result.manualEventPeriods).toEqual([
      { start: "2026-02-01", end: "2026-02-05" },
    ]);
    expect(result.evalPolicies).toEqual([
      "all_days",
      "exclude_flagged_plus_recovery",
    ]);
  });

  it("recovery_days が欠損している場合はデフォルト 2 を使う", () => {
    const config: Json = { eval_policies: ["all_days"] };
    const result = parseRunConfig(config);
    expect(result.recoveryDays).toBe(2);
  });

  it("manual_event_periods が空配列の場合は空を返す", () => {
    const config: Json = { manual_event_periods: [] };
    const result = parseRunConfig(config);
    expect(result.manualEventPeriods).toEqual([]);
  });

  it("config が null の場合はデフォルト値を返す", () => {
    const result = parseRunConfig(null);
    expect(result.recoveryDays).toBe(2);
    expect(result.manualEventPeriods).toEqual([]);
    expect(result.evalPolicies).toEqual([]);
  });

  it("manual_event_periods 内に不正なエントリが含まれても無視する", () => {
    const config: Json = {
      manual_event_periods: [
        { start: "2026-01-01", end: "2026-01-03" },
        { start: 12345 },            // 不正: start が number
        null,                        // 不正: null エントリ
        { start: "2026-02-01" },     // 不正: end 欠損
      ],
    };
    const result = parseRunConfig(config);
    expect(result.manualEventPeriods).toEqual([
      { start: "2026-01-01", end: "2026-01-03" },
    ]);
  });
});

// ── buildExclusionList ────────────────────────────────────────────────────

describe("buildExclusionList", () => {
  it("フラグなし・手動期間なしの場合は空配列を返す", () => {
    const logs = [
      { log_date: "2026-01-01", is_cheat_day: false, is_travel_day: false },
      { log_date: "2026-01-02", is_cheat_day: null,  is_travel_day: null },
    ];
    const result = buildExclusionList(logs, 2, []);
    expect(result).toHaveLength(0);
  });

  it("cheat_day の当日と回復日 (recoveryDays 日分) を除外する", () => {
    const logs = [
      { log_date: "2026-01-05", is_cheat_day: true, is_travel_day: false },
    ];
    const result = buildExclusionList(logs, 2, []);
    // 当日 + 回復 2 日 = 3 件
    expect(result).toHaveLength(3);

    const cheat = result.find((e) => e.date === "2026-01-05");
    expect(cheat?.reason).toBe("cheat_day");
    expect(cheat?.source).toBe("daily_logs");

    const rec1 = result.find((e) => e.date === "2026-01-06");
    expect(rec1?.reason).toBe("recovery_day");
    expect(rec1?.source).toBe("derived");

    const rec2 = result.find((e) => e.date === "2026-01-07");
    expect(rec2?.reason).toBe("recovery_day");
    expect(rec2?.source).toBe("derived");
  });

  it("travel_day の当日と回復日を除外する", () => {
    const logs = [
      { log_date: "2026-02-10", is_cheat_day: false, is_travel_day: true },
    ];
    const result = buildExclusionList(logs, 2, []);
    expect(result).toHaveLength(3);

    const travel = result.find((e) => e.date === "2026-02-10");
    expect(travel?.reason).toBe("travel_day");
    expect(travel?.source).toBe("daily_logs");
  });

  it("手動 event period の全日と end 後の回復日を除外する", () => {
    const result = buildExclusionList(
      [],
      2,
      [{ start: "2026-03-01", end: "2026-03-03" }],
    );
    // 期間内 3 日 + 回復 2 日 = 5 件
    expect(result).toHaveLength(5);

    expect(result.find((e) => e.date === "2026-03-01")?.reason).toBe("manual_event_period");
    expect(result.find((e) => e.date === "2026-03-01")?.source).toBe("manual");
    expect(result.find((e) => e.date === "2026-03-04")?.reason).toBe("recovery_day");
    expect(result.find((e) => e.date === "2026-03-05")?.reason).toBe("recovery_day");
    // 回復 2 日のみ (3 日目は含まれない)
    expect(result.find((e) => e.date === "2026-03-06")).toBeUndefined();
  });

  it("結果は日付昇順でソートされる", () => {
    const logs = [
      { log_date: "2026-01-10", is_cheat_day: true, is_travel_day: false },
      { log_date: "2026-01-05", is_cheat_day: true, is_travel_day: false },
    ];
    const result = buildExclusionList(logs, 1, []);
    const dates = result.map((e) => e.date);
    expect(dates).toEqual([...dates].sort());
  });

  it("cheat_day と recovery_day が同日に重複する場合は cheat_day が優先される", () => {
    // 2026-01-05 が cheat_day で、2026-01-06 が回復日
    // 2026-01-06 も別の cheat_day の当日なら cheat_day が優先
    const logs = [
      { log_date: "2026-01-05", is_cheat_day: true,  is_travel_day: false },
      { log_date: "2026-01-06", is_cheat_day: true,  is_travel_day: false },
    ];
    const result = buildExclusionList(logs, 2, []);
    const jan06 = result.find((e) => e.date === "2026-01-06");
    // 2026-01-06 は 01-05 の回復日だが、自身も cheat_day なので cheat_day が優先
    expect(jan06?.reason).toBe("cheat_day");
    expect(jan06?.source).toBe("daily_logs");
  });

  it("travel_day は recovery_day より優先される", () => {
    // 2026-01-05 が cheat_day → 回復日: 01-06, 01-07
    // 2026-01-06 が travel_day → travel_day が優先
    const logs = [
      { log_date: "2026-01-05", is_cheat_day: true,  is_travel_day: false },
      { log_date: "2026-01-06", is_cheat_day: false, is_travel_day: true },
    ];
    const result = buildExclusionList(logs, 2, []);
    const jan06 = result.find((e) => e.date === "2026-01-06");
    expect(jan06?.reason).toBe("travel_day");
  });

  it("cheat_day は manual_event_period より優先される", () => {
    const logs = [
      { log_date: "2026-02-05", is_cheat_day: true, is_travel_day: false },
    ];
    const result = buildExclusionList(
      logs,
      2,
      [{ start: "2026-02-03", end: "2026-02-07" }],
    );
    const feb05 = result.find((e) => e.date === "2026-02-05");
    // manual_event_period 範囲内だが cheat_day が優先
    expect(feb05?.reason).toBe("cheat_day");
  });

  it("recoveryDays=0 の場合はイベント当日のみ除外する", () => {
    const logs = [
      { log_date: "2026-01-15", is_cheat_day: true, is_travel_day: false },
    ];
    const result = buildExclusionList(logs, 0, []);
    expect(result).toHaveLength(1);
    const entry = result[0] as ExcludedDateEntry;
    expect(entry.date).toBe("2026-01-15");
    expect(entry.reason).toBe("cheat_day");
  });

  it("複数の手動 event period を正しく処理する", () => {
    const result = buildExclusionList(
      [],
      1,
      [
        { start: "2026-01-01", end: "2026-01-02" }, // 2日 + 回復1日
        { start: "2026-02-10", end: "2026-02-10" }, // 1日 + 回復1日
      ],
    );
    // 2026-01-01, 01-02, 01-03(回復), 02-10, 02-11(回復) = 5件
    expect(result).toHaveLength(5);
    expect(result.find((e) => e.date === "2026-01-01")?.reason).toBe("manual_event_period");
    expect(result.find((e) => e.date === "2026-01-03")?.reason).toBe("recovery_day");
    expect(result.find((e) => e.date === "2026-02-10")?.reason).toBe("manual_event_period");
    expect(result.find((e) => e.date === "2026-02-11")?.reason).toBe("recovery_day");
  });

  it("重複カウントせず一意な日付エントリを返す", () => {
    // cheat_day と travel_day が同日: 1エントリのみ
    const logs = [
      { log_date: "2026-01-20", is_cheat_day: true, is_travel_day: true },
    ];
    const result = buildExclusionList(logs, 2, []);
    const jan20 = result.filter((e) => e.date === "2026-01-20");
    expect(jan20).toHaveLength(1);
  });
});
