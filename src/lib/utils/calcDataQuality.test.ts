import { calcDataQuality } from "./calcDataQuality";
import type { DataQualityLog } from "./calcDataQuality";
import { dateRangeStr } from "./date";

// ---- ヘルパー ----

function makeLog(
  log_date: string,
  overrides: Partial<DataQualityLog> = {}
): DataQualityLog {
  return {
    log_date,
    weight: 70,
    calories: 2000,
    had_bowel_movement: true,
    work_mode: "office",
    training_type: "chest",
    ...overrides,
  };
}

/** today 基準で n 日前の日付文字列を生成 (n=0 なら today 自身) */
function daysBack(today: string, n: number): string {
  const [y, m, d] = today.split("-").map(Number);
  // Date.UTC で構築することで実行環境のローカルタイムゾーンに依存しない
  const date = new Date(Date.UTC(y!, m! - 1, d! - n));
  return date.toISOString().slice(0, 10);
}

// ---- テスト ----

describe("calcDataQuality", () => {
  describe("評価開始日による期間制限", () => {
    const today = "2026-08-30";
    const startDate = "2026-08-29";

    it("開始2日目に全項目がそろっていれば開始前を欠損・減点にしない", () => {
      const report = calcDataQuality([makeLog(startDate), makeLog(today)], today, { startDate });
      for (const window of [report.period7, report.period14]) {
        expect(window).toEqual({
          totalDays: 2,
          weightMissingDays: 0,
          caloriesMissingDays: 0,
          missingFields: { bowelMovementDays: 0, workModeDays: 0, trainingTypeDays: 0 },
          anomalies: [],
          score: 100,
        });
      }
    });

    it("最初の記録日で区切らず、開始日以降の記録がない日を欠損・減点にする", () => {
      const report = calcDataQuality([makeLog(today)], today, { startDate: "2026-08-28" });
      expect(report.period7).toMatchObject({
        totalDays: 3,
        weightMissingDays: 2,
        caloriesMissingDays: 2,
        missingFields: { bowelMovementDays: 2, workModeDays: 2, trainingTypeDays: 2 },
        score: 58,
      });
    });

    it.each([
      ["weight", 90],
      ["calories", 95],
      ["had_bowel_movement", 98],
      ["work_mode", 98],
      ["training_type", 98],
    ] as const)("開始後の%sのnullは従来の重みで減点する", (field, score) => {
      const report = calcDataQuality([
        makeLog(startDate),
        makeLog(today, { [field]: null }),
      ], today, { startDate });
      expect(report.period7.totalDays).toBe(2);
      expect(report.period7.score).toBe(score);
    });

    it.each([
      ["2026-08-30", 1, 1],
      ["2026-08-24", 7, 7],
      ["2026-08-23", 7, 8],
      ["2026-08-17", 7, 14],
      ["2026-08-01", 7, 14],
    ] as const)("開始日%sからの対象日数を7日/14日それぞれで求める", (from, days7, days14) => {
      const logs = dateRangeStr(from, today).map((date) => makeLog(date));
      const report = calcDataQuality(logs, today, { startDate: from });
      expect(report.period7).toMatchObject({ totalDays: days7, score: 100 });
      expect(report.period14).toMatchObject({ totalDays: days14, score: 100 });
    });

    it.each([
      ["2026-03-31", "2026-04-01"],
      ["2026-12-31", "2027-01-01"],
    ])("月/年境界の%s〜%sも2日として扱う", (from, to) => {
      const report = calcDataQuality([makeLog(from), makeLog(to)], to, { startDate: from });
      expect(report.period7).toMatchObject({ totalDays: 2, weightMissingDays: 0, score: 100 });
      expect(report.period14.totalDays).toBe(2);
    });

    it("開始前・未来のログの異常値や重複を混ぜず、元のログ配列も変更しない", () => {
      const currentLogs = [makeLog(startDate), makeLog(today)];
      const logs = [
        makeLog("2026-08-28", { weight: 100, calories: 9000 }),
        makeLog("2026-08-28", { weight: 100, calories: 9000 }),
        ...currentLogs,
        makeLog("2026-08-31", { weight: 100, calories: 9000 }),
        makeLog("2026-08-31", { weight: 100, calories: 9000 }),
      ];
      const before = logs.map((log) => ({ ...log }));
      expect(calcDataQuality(logs, today, { startDate }))
        .toEqual(calcDataQuality(currentLogs, today, { startDate }));
      expect(logs).toEqual(before);
    });

    it("開始後の体重変動やカロリー異常値は引き続き検知する", () => {
      const report = calcDataQuality([
        makeLog(startDate),
        makeLog(today, { weight: 74, calories: 9000 }),
      ], today, { startDate });
      expect(report.period7.anomalies.map((a) => a.type).sort()).toEqual(["calories_high", "weight_jump"]);
      expect(report.period7.score).toBe(70);
    });

    it("開始日が未来なら評価対象0日で欠損・異常値なし", () => {
      const report = calcDataQuality([makeLog(today)], today, { startDate: "2026-08-31" });
      expect(report.period7).toMatchObject({ totalDays: 0, weightMissingDays: 0, caloriesMissingDays: 0, anomalies: [] });
      expect(report.period14.totalDays).toBe(0);
    });

    it("開始日オプションなしは他画面向けの直近7日/14日評価を維持する", () => {
      const logs = [makeLog(startDate), makeLog(today)];
      const report = calcDataQuality(logs, today);
      expect(calcDataQuality(logs, today, {})).toEqual(report);
      expect(report.period7).toMatchObject({ totalDays: 7, weightMissingDays: 5, caloriesMissingDays: 5, score: 0 });
      expect(report.period14).toMatchObject({ totalDays: 14, weightMissingDays: 12, caloriesMissingDays: 12, score: 0 });
    });
  });

  describe("日付ウィンドウ", () => {
    it("today を含む直近 7 日間の totalDays が 7 になる", () => {
      const today = "2026-04-25";
      const report = calcDataQuality([], today);
      expect(report.period7.totalDays).toBe(7);
    });

    it("today を含む直近 14 日間の totalDays が 14 になる", () => {
      const today = "2026-04-25";
      const report = calcDataQuality([], today);
      expect(report.period14.totalDays).toBe(14);
    });

    it("today のログが存在しない場合、7日ウィンドウで weight・calories が 1日欠損と判定される", () => {
      const today = "2026-04-25";
      // today 以外の 6 日分のみログあり
      const logs = Array.from({ length: 6 }, (_, i) => makeLog(daysBack(today, i + 1)));
      const report = calcDataQuality(logs, today);
      expect(report.period7.weightMissingDays).toBe(1);
      expect(report.period7.caloriesMissingDays).toBe(1);
    });

    it("ウィンドウ外の欠損は計上しない", () => {
      const today = "2026-04-25";
      // 7日ウィンドウ内 (Apr 19-25) はすべてログあり。その前日 Apr 18 は欠損だがカウントされない。
      const logs = Array.from({ length: 7 }, (_, i) => makeLog(daysBack(today, i)));
      const report = calcDataQuality(logs, today);
      expect(report.period7.weightMissingDays).toBe(0);
    });
  });

  describe("体重・カロリー欠損", () => {
    it("ログが存在しない日を欠損として検知する", () => {
      const today = "2026-04-25";
      const report = calcDataQuality([], today);
      expect(report.period7.weightMissingDays).toBe(7);
      expect(report.period7.caloriesMissingDays).toBe(7);
    });

    it("ログが存在するが calories === null の日は calories 欠損として検知する", () => {
      const today = "2026-04-25";
      // 7日分すべてログあり。今日だけ calories が null
      const logs = Array.from({ length: 7 }, (_, i) =>
        makeLog(daysBack(today, i), i === 0 ? { calories: null } : {})
      );
      const report = calcDataQuality(logs, today);
      expect(report.period7.caloriesMissingDays).toBe(1);
      expect(report.period7.weightMissingDays).toBe(0); // weight は全日 non-null
    });

    it("calories === 0 は食事未記録として欠損扱いする", () => {
      const today = "2026-04-25";
      const logs = Array.from({ length: 7 }, (_, i) =>
        makeLog(daysBack(today, i), { calories: i === 0 ? 0 : 2000 })
      );
      const report = calcDataQuality(logs, today);
      expect(report.period7.caloriesMissingDays).toBe(1);
      expect(report.period7.anomalies).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ type: "calories_low", value: 0 })])
      );
    });
  });

  describe("スコア計算", () => {
    it("欠損・異常値がゼロのとき score === 100", () => {
      const today = "2026-04-25";
      const logs = Array.from({ length: 7 }, (_, i) => makeLog(daysBack(today, i)));
      const report = calcDataQuality(logs, today);
      expect(report.period7.score).toBe(100);
    });

    it("当日ログなし: 体重・カロリー・必須3項目の欠損がスコアに反映される", () => {
      const today = "2026-04-25";
      // 今日だけログなし (6日分はすべての項目が揃ったログ)
      const logs = Array.from({ length: 6 }, (_, i) => makeLog(daysBack(today, i + 1)));
      const report = calcDataQuality(logs, today);
      // ログなし 1日: weight(-10) + calories(-5) + 3項目各(-2) = -21
      expect(report.period7.score).toBe(Math.max(0, 100 - 10 - 5 - 3 * 2));
    });

    it("スコアは 0 を下回らない", () => {
      const today = "2026-04-25";
      const report = calcDataQuality([], today); // 7日全欠損 = -70 - 35 = -105 → 0
      expect(report.period7.score).toBe(0);
    });
  });

  describe("必須項目 missingFields", () => {
    it("had_bowel_movement === false は欠損扱いしない", () => {
      const today = "2026-04-25";
      const logs = Array.from({ length: 7 }, (_, i) =>
        makeLog(daysBack(today, i), { had_bowel_movement: false })
      );
      const report = calcDataQuality(logs, today);
      expect(report.period7.missingFields.bowelMovementDays).toBe(0);
    });

    it("had_bowel_movement === null は欠損扱いする", () => {
      const today = "2026-04-25";
      const logs = Array.from({ length: 7 }, (_, i) =>
        makeLog(daysBack(today, i), { had_bowel_movement: null })
      );
      const report = calcDataQuality(logs, today);
      expect(report.period7.missingFields.bowelMovementDays).toBe(7);
    });

    it("had_bowel_movement === true は欠損扱いしない", () => {
      const today = "2026-04-25";
      const logs = Array.from({ length: 7 }, (_, i) =>
        makeLog(daysBack(today, i), { had_bowel_movement: true })
      );
      const report = calcDataQuality(logs, today);
      expect(report.period7.missingFields.bowelMovementDays).toBe(0);
    });

    it("work_mode === null は欠損として計上する", () => {
      const today = "2026-04-25";
      const logs = Array.from({ length: 7 }, (_, i) =>
        makeLog(daysBack(today, i), { work_mode: null })
      );
      const report = calcDataQuality(logs, today);
      expect(report.period7.missingFields.workModeDays).toBe(7);
    });

    it("training_type === null は欠損として計上する", () => {
      const today = "2026-04-25";
      const logs = Array.from({ length: 7 }, (_, i) =>
        makeLog(daysBack(today, i), { training_type: null })
      );
      const report = calcDataQuality(logs, today);
      expect(report.period7.missingFields.trainingTypeDays).toBe(7);
    });

    it("必須項目の未記録はスコアに反映される (-2/日/項目)", () => {
      const today = "2026-04-25";
      const logs = Array.from({ length: 7 }, (_, i) =>
        makeLog(daysBack(today, i), {
          had_bowel_movement: null,
          work_mode: null,
          training_type: null,
        })
      );
      const report = calcDataQuality(logs, today);
      // 3項目 × 7日 × (-2) = -42
      expect(report.period7.score).toBe(Math.max(0, 100 - 3 * 7 * 2));
      expect(report.period7.missingFields.bowelMovementDays).toBe(7);
      expect(report.period7.missingFields.workModeDays).toBe(7);
      expect(report.period7.missingFields.trainingTypeDays).toBe(7);
    });

    it("ログが存在しない日はすべての必須項目が欠損として計上される", () => {
      const today = "2026-04-25";
      // ログなし → 7日すべて欠損
      const report = calcDataQuality([], today);
      expect(report.period7.missingFields.bowelMovementDays).toBe(7);
      expect(report.period7.missingFields.workModeDays).toBe(7);
      expect(report.period7.missingFields.trainingTypeDays).toBe(7);
    });
  });

  describe("異常値検知", () => {
    it("前日比 3kg 超の体重変化を weight_jump として検知する", () => {
      const today = "2026-04-25";
      const logs = [
        makeLog(daysBack(today, 1), { weight: 70 }),
        makeLog(today, { weight: 73.1 }), // +3.1kg
      ];
      const report = calcDataQuality(logs, today);
      expect(report.period7.anomalies.some((a) => a.type === "weight_jump")).toBe(true);
    });

    it("前日比ちょうど 3kg は weight_jump として検知しない (> 3.0kg が閾値)", () => {
      const today = "2026-04-25";
      const logs = [
        makeLog(daysBack(today, 1), { weight: 70 }),
        makeLog(today, { weight: 73 }), // ちょうど +3.0kg
      ];
      const report = calcDataQuality(logs, today);
      expect(report.period7.anomalies.some((a) => a.type === "weight_jump")).toBe(false);
    });

    it("500 kcal 未満のカロリーを calories_low として検知する", () => {
      const today = "2026-04-25";
      const logs = [makeLog(today, { calories: 400 })];
      const report = calcDataQuality(logs, today);
      expect(report.period7.anomalies.some((a) => a.type === "calories_low")).toBe(true);
    });

    it("8000 kcal 超のカロリーを calories_high として検知する", () => {
      const today = "2026-04-25";
      const logs = [makeLog(today, { calories: 8001 })];
      const report = calcDataQuality(logs, today);
      expect(report.period7.anomalies.some((a) => a.type === "calories_high")).toBe(true);
    });
  });

  describe("重複日付", () => {
    it("同一 log_date が 2件ある場合 duplicateDates に含まれる", () => {
      const today = "2026-04-25";
      const logs = [makeLog(today), makeLog(today)];
      const report = calcDataQuality(logs, today);
      expect(report.duplicateDates).toContain(today);
    });
  });
});
