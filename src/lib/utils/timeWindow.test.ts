/**
 * timeWindow.test.ts
 *
 * 暦日ベース / 記録日ベースの時間ウィンドウ関数のテスト。
 *
 * テスト設計の指針:
 *   - 暦日ベースと記録日ベースの挙動の違いを明示する
 *   - 欠損日がある場合の挙動を確認する（暦日ベースでは件数が減る）
 *   - 前週比較が正しく7日ずつ分かれることを確認する
 *   - 境界条件（空配列、1件）を確認する
 */

import {
  calendarDaysWindow,
  filterLastNCalendarDays,
  filterPrevNCalendarDays,
  lastNEntries,
  prevNEntries,
} from "./timeWindow";

// ─── テスト用ヘルパー ─────────────────────────────────────────────────────────

/** log_date だけを持つ最小ログ型 */
function makeLog(date: string) {
  return { log_date: date };
}

/** 連続した日付のログを生成 (欠損なし) */
function makeConsecutiveLogs(startDate: string, count: number) {
  const logs = [];
  const [y, m, d] = startDate.split("-").map(Number);
  const base = new Date(y, m - 1, d);
  for (let i = 0; i < count; i++) {
    const cur = new Date(base);
    cur.setDate(base.getDate() + i);
    const pad = (n: number) => String(n).padStart(2, "0");
    const dateStr = `${cur.getFullYear()}-${pad(cur.getMonth() + 1)}-${pad(cur.getDate())}`;
    logs.push(makeLog(dateStr));
  }
  return logs;
}

// ─── calendarDaysWindow ───────────────────────────────────────────────────────

describe("calendarDaysWindow", () => {
  it("n=7 で today を含む 7 日分の Set を返す", () => {
    const result = calendarDaysWindow("2026-03-14", 7);
    expect(result.size).toBe(7);
    expect(result.has("2026-03-08")).toBe(true);
    expect(result.has("2026-03-09")).toBe(true);
    expect(result.has("2026-03-14")).toBe(true);
    expect(result.has("2026-03-07")).toBe(false); // 範囲外
    expect(result.has("2026-03-15")).toBe(false); // 未来
  });

  it("n=1 で today のみを返す", () => {
    const result = calendarDaysWindow("2026-03-14", 1);
    expect(result.size).toBe(1);
    expect(result.has("2026-03-14")).toBe(true);
  });

  it("月をまたぐウィンドウ", () => {
    const result = calendarDaysWindow("2026-03-03", 7);
    expect(result.size).toBe(7);
    expect(result.has("2026-02-25")).toBe(true);
    expect(result.has("2026-03-03")).toBe(true);
    expect(result.has("2026-02-24")).toBe(false);
  });

  it("不正な today は空 Set を返す", () => {
    expect(calendarDaysWindow("abc", 7).size).toBe(0);
    expect(calendarDaysWindow("2026/03/14", 7).size).toBe(0);
  });
});

// ─── filterLastNCalendarDays ──────────────────────────────────────────────────

describe("filterLastNCalendarDays", () => {
  it("欠損なし: 直近 7 暦日のログを正しく抽出する", () => {
    const logs = makeConsecutiveLogs("2026-03-01", 14); // 3/1〜3/14
    const result = filterLastNCalendarDays(logs, "2026-03-14", 7);
    expect(result.map((l) => l.log_date)).toEqual([
      "2026-03-08",
      "2026-03-09",
      "2026-03-10",
      "2026-03-11",
      "2026-03-12",
      "2026-03-13",
      "2026-03-14",
    ]);
  });

  it("欠損あり: 欠損日を含む暦日ウィンドウでは件数が減る", () => {
    // 3/10, 3/12, 3/14 の3日だけ記録がある (3/8, 9, 11, 13 が欠損)
    const logs = [
      makeLog("2026-03-10"),
      makeLog("2026-03-12"),
      makeLog("2026-03-14"),
    ];
    const result = filterLastNCalendarDays(logs, "2026-03-14", 7);
    // 7 暦日 (3/8〜3/14) に含まれるのは 3 件だけ
    expect(result.length).toBe(3);
    expect(result.map((l) => l.log_date)).toEqual([
      "2026-03-10",
      "2026-03-12",
      "2026-03-14",
    ]);
  });

  it("ウィンドウ外のログは除外される", () => {
    const logs = makeConsecutiveLogs("2026-03-01", 14);
    const result = filterLastNCalendarDays(logs, "2026-03-14", 7);
    // 3/1〜3/7 は含まれない
    expect(result.every((l) => l.log_date >= "2026-03-08")).toBe(true);
    expect(result.length).toBe(7);
  });

  it("空配列は空を返す", () => {
    expect(filterLastNCalendarDays([], "2026-03-14", 7)).toEqual([]);
  });

  it("ログが1件のみ: today と一致すれば返す", () => {
    const logs = [makeLog("2026-03-14")];
    expect(filterLastNCalendarDays(logs, "2026-03-14", 7).length).toBe(1);
    expect(filterLastNCalendarDays(logs, "2026-03-14", 7)[0].log_date).toBe("2026-03-14");
  });

  it("ログが1件のみ: ウィンドウ外なら空を返す", () => {
    const logs = [makeLog("2026-03-01")];
    expect(filterLastNCalendarDays(logs, "2026-03-14", 7)).toEqual([]);
  });
});

// ─── filterPrevNCalendarDays ──────────────────────────────────────────────────

describe("filterPrevNCalendarDays", () => {
  it("前週 7 日（直近7日の1つ前）を正しく抽出する", () => {
    const logs = makeConsecutiveLogs("2026-02-22", 21); // 2/22〜3/14
    const result = filterPrevNCalendarDays(logs, "2026-03-14", 7);
    // 前週 = 3/1〜3/7
    expect(result.map((l) => l.log_date)).toEqual([
      "2026-03-01",
      "2026-03-02",
      "2026-03-03",
      "2026-03-04",
      "2026-03-05",
      "2026-03-06",
      "2026-03-07",
    ]);
  });

  it("直近7日と前週7日は重ならない（境界チェック）", () => {
    const logs = makeConsecutiveLogs("2026-02-22", 21);
    const current = filterLastNCalendarDays(logs, "2026-03-14", 7);
    const prev = filterPrevNCalendarDays(logs, "2026-03-14", 7);
    const currentDates = new Set(current.map((l) => l.log_date));
    const prevDates = new Set(prev.map((l) => l.log_date));
    // 共通する日付がないことを確認
    const overlap = [...prevDates].filter((d) => currentDates.has(d));
    expect(overlap.length).toBe(0);
  });

  it("欠損あり: 前週にも欠損があれば件数が減る", () => {
    // 前週 (3/1〜3/7) のうち 3/3, 3/5, 3/7 だけ記録
    const logs = [
      makeLog("2026-03-03"),
      makeLog("2026-03-05"),
      makeLog("2026-03-07"),
      makeLog("2026-03-08"), // 直近7日に属する
    ];
    const result = filterPrevNCalendarDays(logs, "2026-03-14", 7);
    expect(result.length).toBe(3);
    expect(result.map((l) => l.log_date)).toEqual([
      "2026-03-03",
      "2026-03-05",
      "2026-03-07",
    ]);
  });

  it("空配列は空を返す", () => {
    expect(filterPrevNCalendarDays([], "2026-03-14", 7)).toEqual([]);
  });

  it("ログが1件でも前週ウィンドウ外なら空を返す", () => {
    const logs = [makeLog("2026-03-14")]; // 直近7日に属するが前週ではない
    expect(filterPrevNCalendarDays(logs, "2026-03-14", 7)).toEqual([]);
  });
});

// ─── 暦日ベース vs 記録日ベースの挙動の違いを明示するテスト ─────────────────

describe("暦日ベース vs 記録日ベースの挙動の違い", () => {
  it("欠損3日がある場合: 暦日ベースは4件、記録日ベースは7件（異なる期間を対象）", () => {
    // 今日から遡って 14 件の記録があるが、直近7暦日には4件しかない
    // (3/8〜3/14 の7暦日のうち、記録があるのは 3/8, 3/10, 3/12, 3/14 の4日)
    const logs = [
      makeLog("2026-03-01"),
      makeLog("2026-03-02"),
      makeLog("2026-03-03"),
      makeLog("2026-03-08"), // 7暦日ウィンドウここから
      makeLog("2026-03-10"),
      makeLog("2026-03-12"),
      makeLog("2026-03-14"),
    ];

    // 暦日ベース: 3/8〜3/14 に含まれる4件のみ
    const calResult = filterLastNCalendarDays(logs, "2026-03-14", 7);
    expect(calResult.length).toBe(4);
    expect(calResult[0].log_date).toBe("2026-03-08");

    // 記録日ベース: 末尾から7件 → 3/3, 3/8, 3/10, 3/12, 3/14 + 3/1, 3/2 = 7件
    // つまり 3/1〜3/3 の古いデータも含まれる（欠損分だけ過去にずれる）
    const entryResult = lastNEntries(logs, 7);
    expect(entryResult.length).toBe(7);
    expect(entryResult[0].log_date).toBe("2026-03-01"); // 記録日ベースは2週間前まで遡る

    // 両者で先頭の日付が異なることを確認（定義が異なることの明示）
    expect(calResult[0].log_date).not.toBe(entryResult[0].log_date);
  });
});

// ─── lastNEntries ─────────────────────────────────────────────────────────────

describe("lastNEntries", () => {
  it("末尾 n 件を返す", () => {
    const logs = makeConsecutiveLogs("2026-03-01", 14);
    const result = lastNEntries(logs, 7);
    expect(result.length).toBe(7);
    expect(result[0].log_date).toBe("2026-03-08");
    expect(result[6].log_date).toBe("2026-03-14");
  });

  it("ログが n 未満の場合は全件返す", () => {
    const logs = makeConsecutiveLogs("2026-03-01", 3);
    const result = lastNEntries(logs, 7);
    expect(result.length).toBe(3);
  });

  it("空配列は空を返す", () => {
    expect(lastNEntries([], 7)).toEqual([]);
  });

  it("n=0 は空を返す", () => {
    const logs = makeConsecutiveLogs("2026-03-01", 5);
    expect(lastNEntries(logs, 0)).toEqual([]);
  });
});

// ─── prevNEntries ─────────────────────────────────────────────────────────────

describe("prevNEntries", () => {
  it("直近 n 件の1つ前の n 件を返す", () => {
    const logs = makeConsecutiveLogs("2026-03-01", 14); // 3/1〜3/14
    const result = prevNEntries(logs, 7);
    // 末尾7件 = 3/8〜3/14, その前7件 = 3/1〜3/7
    expect(result.length).toBe(7);
    expect(result[0].log_date).toBe("2026-03-01");
    expect(result[6].log_date).toBe("2026-03-07");
  });

  it("lastNEntries と prevNEntries は重ならない", () => {
    const logs = makeConsecutiveLogs("2026-03-01", 14);
    const current = new Set(lastNEntries(logs, 7).map((l) => l.log_date));
    const prev = new Set(prevNEntries(logs, 7).map((l) => l.log_date));
    const overlap = [...prev].filter((d) => current.has(d));
    expect(overlap.length).toBe(0);
  });

  it("ログが n 未満の場合: prev は空を返す", () => {
    const logs = makeConsecutiveLogs("2026-03-01", 5); // 5件しかない
    // 末尾5件取得後、前5件を取ろうとしても残りがない
    const result = prevNEntries(logs, 7);
    expect(result.length).toBe(0);
  });

  it("ログが n 〜 2n-1 件の場合: prev は不足分だけ返す", () => {
    const logs = makeConsecutiveLogs("2026-03-01", 10); // 10件
    // n=7: 末尾7件=3/4〜3/10, 前7件を取ろうとしても3件しかない
    const result = prevNEntries(logs, 7);
    expect(result.length).toBe(3);
    expect(result[0].log_date).toBe("2026-03-01");
    expect(result[2].log_date).toBe("2026-03-03");
  });

  it("空配列は空を返す", () => {
    expect(prevNEntries([], 7)).toEqual([]);
  });

  it("ログが1件のみ: prev は空を返す", () => {
    const logs = [makeLog("2026-03-14")];
    expect(prevNEntries(logs, 7)).toEqual([]);
  });
});
