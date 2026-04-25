import { calcDataQuality } from "./calcDataQuality";
import type { DataQualityLog, DataQualitySleepEntry } from "./calcDataQuality";

// ---- ヘルパー ----

function makeLog(
  log_date: string,
  overrides: Partial<DataQualityLog> = {}
): DataQualityLog {
  return {
    log_date,
    weight: 70,
    calories: 2000,
    last_meal_end_time: "21:00:00",
    had_bowel_movement: true,
    work_mode: "office",
    training_type: "chest",
    ...overrides,
  };
}

function makeSleep(wake_date: string): DataQualitySleepEntry {
  return { wake_date };
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

    it("calories === 0 は欠損扱いしない (有効な記録値として扱う)", () => {
      const today = "2026-04-25";
      const logs = Array.from({ length: 7 }, (_, i) =>
        makeLog(daysBack(today, i), { calories: i === 0 ? 0 : 2000 })
      );
      const report = calcDataQuality(logs, today);
      // 0 kcal は欠損でない (calories !== null)
      expect(report.period7.caloriesMissingDays).toBe(0);
    });
  });

  describe("スコア計算", () => {
    it("欠損・異常値がゼロのとき score === 100", () => {
      const today = "2026-04-25";
      const logs = Array.from({ length: 7 }, (_, i) => makeLog(daysBack(today, i)));
      const report = calcDataQuality(logs, today);
      expect(report.period7.score).toBe(100);
    });

    it("体重欠損 1 日につき -10", () => {
      const today = "2026-04-25";
      const logs = Array.from({ length: 6 }, (_, i) => makeLog(daysBack(today, i + 1)));
      const report = calcDataQuality(logs, today);
      expect(report.period7.score).toBe(100 - 10 - 5); // weight + calories 各 1 日欠損
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

    it("last_meal_end_time === null は欠損として計上する", () => {
      const today = "2026-04-25";
      const logs = Array.from({ length: 7 }, (_, i) =>
        makeLog(daysBack(today, i), { last_meal_end_time: null })
      );
      const report = calcDataQuality(logs, today);
      expect(report.period7.missingFields.lastMealEndTimeDays).toBe(7);
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

    it("必須項目の未記録はスコアに影響しない", () => {
      const today = "2026-04-25";
      const logs = Array.from({ length: 7 }, (_, i) =>
        makeLog(daysBack(today, i), {
          last_meal_end_time: null,
          had_bowel_movement: null,
          work_mode: null,
          training_type: null,
        })
      );
      const report = calcDataQuality(logs, today);
      // weight・calories はすべて記録済みなので score === 100 のまま
      expect(report.period7.score).toBe(100);
      expect(report.period7.missingFields.lastMealEndTimeDays).toBe(7);
      expect(report.period7.missingFields.bowelMovementDays).toBe(7);
      expect(report.period7.missingFields.workModeDays).toBe(7);
      expect(report.period7.missingFields.trainingTypeDays).toBe(7);
    });

    it("ログが存在しない日はすべての必須項目が欠損として計上される", () => {
      const today = "2026-04-25";
      // ログなし → 7日すべて欠損
      const report = calcDataQuality([], today);
      expect(report.period7.missingFields.lastMealEndTimeDays).toBe(7);
      expect(report.period7.missingFields.bowelMovementDays).toBe(7);
      expect(report.period7.missingFields.workModeDays).toBe(7);
      expect(report.period7.missingFields.trainingTypeDays).toBe(7);
    });
  });

  describe("睡眠セッション (sleepUnloggedDays)", () => {
    it("sleepSessions が省略された場合 sleepUnloggedDays は常に 0", () => {
      const today = "2026-04-25";
      const report = calcDataQuality([], today);
      expect(report.period7.missingFields.sleepUnloggedDays).toBe(0);
    });

    it("sleepSessions が空配列の場合 sleepUnloggedDays は totalDays と等しい", () => {
      const today = "2026-04-25";
      const report = calcDataQuality([], today, []);
      expect(report.period7.missingFields.sleepUnloggedDays).toBe(7);
    });

    it("today のスリープセッションがある場合は sleepUnloggedDays に計上しない", () => {
      const today = "2026-04-25";
      const sleepSessions = [makeSleep(today)];
      const report = calcDataQuality([], today, sleepSessions);
      expect(report.period7.missingFields.sleepUnloggedDays).toBe(6); // today 以外の 6 日が未記録
    });

    it("7日分すべてのスリープセッションがある場合 sleepUnloggedDays === 0", () => {
      const today = "2026-04-25";
      const sleepSessions = Array.from({ length: 7 }, (_, i) => makeSleep(daysBack(today, i)));
      const report = calcDataQuality([], today, sleepSessions);
      expect(report.period7.missingFields.sleepUnloggedDays).toBe(0);
    });

    it("14日ウィンドウのスリープ欠損を正しく計上する", () => {
      const today = "2026-04-25";
      // 7日分のみ → 14日ウィンドウでは 7日未記録
      const sleepSessions = Array.from({ length: 7 }, (_, i) => makeSleep(daysBack(today, i)));
      const report = calcDataQuality([], today, sleepSessions);
      expect(report.period14.missingFields.sleepUnloggedDays).toBe(7);
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
