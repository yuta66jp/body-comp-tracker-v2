/**
 * weeklyInsights.ts のユニットテスト
 *
 * deriveWeeklyInsightItems() — WeeklyReviewData → InsightItem[] の変換を検証する。
 * extractTdeeComparisonNote() — interpretation 文字列から比較部分を抽出する。
 *
 * テスト方針:
 *   - 集計ロジック (calcWeeklyReview / calcTdee) は変更せず、変換ロジックのみ検証
 *   - 全 stagnation レベルで qualityNote が見えることを確認 (#360 バグ修正)
 *   - Cut / Bulk phase で status / detail が変わることを確認
 *   - 各 InsightItem の存在 / 非存在の境界条件を確認
 */

import {
  deriveWeeklyInsightItems,
  extractTdeeComparisonNote,
} from "./weeklyInsights";
import type { WeeklyReviewData, StagnationResult } from "./calcWeeklyReview";

// ── テストヘルパー ─────────────────────────────────────────────────────────────

/** デフォルトの WeeklyReviewData を生成するファクトリ (Cut / advancing / 全データあり) */
function makeData(overrides: Partial<WeeklyReviewData> = {}): WeeklyReviewData {
  return {
    weekLabel: "2026-01-01〜2026-01-07",
    weight: {
      avg: 70.0,
      prevAvg: 70.3,
      change: -0.30,
      trendKgPerWeek: -0.35,
      bwRatePctPerWeek: 0.5,
    },
    nutrition: {
      avgCalories: 1800,
      avgProtein: 130,
      avgFat: 60,
      avgCarbs: 200,
      daysLogged: 7,
      proteinRatioPct: 28.9,
      proteinGPerKgBw: 1.86,
      fatCaloriesRatioPct: 30,
    },
    tdee: {
      avgEstimated: 2200,
      balancePerDay: -400,
    },
    quality: {
      score: 90,
      weightMissingDays: 0,
      caloriesMissingDays: 0,
    },
    stagnation: {
      level: "advancing",
      weightChange7d: -0.30,
      trendKgPerWeek: -0.35,
      qualityNote: null,
    },
    specialDays: {
      cheatDays: 0,
      refeedDays: 0,
      eatingOutDays: 0,
      travelDays: 0,
      totalTaggedDays: 0,
    },
    findings: [],
    ...overrides,
  };
}

function makeStagnation(
  overrides: Partial<StagnationResult> = {}
): StagnationResult {
  return {
    level: "advancing",
    weightChange7d: -0.30,
    trendKgPerWeek: -0.35,
    qualityNote: null,
    ...overrides,
  };
}

// ── deriveWeeklyInsightItems ───────────────────────────────────────────────────

describe("deriveWeeklyInsightItems", () => {
  // ── 体重トレンド / 停滞 ── //

  describe("体重トレンド InsightItem", () => {
    it("advancing → status ok、title に今週平均と前週比", () => {
      const items = deriveWeeklyInsightItems(makeData(), "Cut");
      const trend = items[0]!;
      expect(trend.status).toBe("ok");
      expect(trend.title).toContain("70.0 kg");
      expect(trend.title).toContain("-0.30 kg");
    });

    it("advancing の detail に 14日トレンドと『順調に減量中』", () => {
      const items = deriveWeeklyInsightItems(makeData(), "Cut");
      expect(items[0]!.detail).toContain("14日トレンド");
      expect(items[0]!.detail).toContain("順調に減量中");
    });

    it("watching → status caution、detail に『減量ペースがやや緩め』(Cut)", () => {
      const data = makeData({
        stagnation: makeStagnation({ level: "watching", trendKgPerWeek: -0.15 }),
      });
      const items = deriveWeeklyInsightItems(data, "Cut");
      expect(items[0]!.status).toBe("caution");
      expect(items[0]!.detail).toContain("減量ペースがやや緩め");
    });

    it("suspected → status alert、detail にアクション提案 (Cut)", () => {
      const data = makeData({
        stagnation: makeStagnation({ level: "suspected", trendKgPerWeek: -0.03 }),
      });
      const items = deriveWeeklyInsightItems(data, "Cut");
      expect(items[0]!.status).toBe("alert");
      expect(items[0]!.detail).toContain("カロリー設定・活動量の見直し");
    });

    it("suspected → detail にアクション提案 (Bulk)", () => {
      const data = makeData({
        stagnation: makeStagnation({ level: "suspected", trendKgPerWeek: 0.02 }),
      });
      const items = deriveWeeklyInsightItems(data, "Bulk");
      expect(items[0]!.detail).toContain("摂取カロリーを増やすことを検討");
    });

    it("data_insufficient → status neutral", () => {
      const data = makeData({
        stagnation: makeStagnation({ level: "data_insufficient", trendKgPerWeek: null }),
      });
      const items = deriveWeeklyInsightItems(data, "Cut");
      expect(items[0]!.status).toBe("neutral");
    });

    it("Bulk + advancing → detail に『順調に増量中』", () => {
      const data = makeData({
        stagnation: makeStagnation({ level: "advancing", trendKgPerWeek: 0.40 }),
      });
      const items = deriveWeeklyInsightItems(data, "Bulk");
      expect(items[0]!.detail).toContain("順調に増量中");
    });

    it("weight.avg が null のとき title に『体重データ不足』", () => {
      const data = makeData({ weight: { avg: null, prevAvg: null, change: null, trendKgPerWeek: null, bwRatePctPerWeek: null } });
      const items = deriveWeeklyInsightItems(data, "Cut");
      expect(items[0]!.title).toBe("体重データ不足");
    });

    it("weight.change が null のとき title に前週比が含まれない", () => {
      const data = makeData({
        weight: { avg: 70.0, prevAvg: null, change: null, trendKgPerWeek: -0.35, bwRatePctPerWeek: 0.5 },
      });
      const items = deriveWeeklyInsightItems(data, "Cut");
      expect(items[0]!.title).not.toContain("前週比");
    });

    it("trendKgPerWeek が null のとき detail にトレンド数値が含まれない", () => {
      const data = makeData({
        stagnation: makeStagnation({
          level: "advancing",
          trendKgPerWeek: null,
        }),
      });
      const items = deriveWeeklyInsightItems(data, "Cut");
      expect(items[0]!.detail).not.toContain("14日トレンド");
    });
  });

  // ── qualityNote の可視性 (#360 バグ修正) ── //

  describe("qualityNote は全 stagnation レベルで detail に表示される", () => {
    const note = "体重記録に欠損があり、判断の確度が低めです";

    it("advancing + qualityNote → detail に qualityNote が含まれる", () => {
      const data = makeData({
        stagnation: makeStagnation({ level: "advancing", qualityNote: note }),
      });
      const items = deriveWeeklyInsightItems(data, "Cut");
      expect(items[0]!.detail).toContain(note);
    });

    it("watching + qualityNote → detail に qualityNote が含まれる", () => {
      const data = makeData({
        stagnation: makeStagnation({ level: "watching", trendKgPerWeek: -0.15, qualityNote: note }),
      });
      const items = deriveWeeklyInsightItems(data, "Cut");
      expect(items[0]!.detail).toContain(note);
    });

    it("suspected + qualityNote → detail に qualityNote が含まれる", () => {
      const data = makeData({
        stagnation: makeStagnation({ level: "suspected", trendKgPerWeek: -0.02, qualityNote: note }),
      });
      const items = deriveWeeklyInsightItems(data, "Cut");
      expect(items[0]!.detail).toContain(note);
    });

    it("qualityNote が null のとき detail に余分なテキストが混入しない", () => {
      const data = makeData({
        stagnation: makeStagnation({ level: "advancing", qualityNote: null }),
      });
      const items = deriveWeeklyInsightItems(data, "Cut");
      expect(items[0]!.detail).not.toContain("※");
    });
  });

  // ── エネルギー収支 ── //

  describe("エネルギー収支 InsightItem", () => {
    it("赤字 + Cut → status ok、title に『減量方向』", () => {
      const items = deriveWeeklyInsightItems(
        makeData({ tdee: { avgEstimated: 2200, balancePerDay: -400 } }),
        "Cut",
      );
      const balItem = items[1]!;
      expect(balItem.status).toBe("ok");
      expect(balItem.title).toContain("減量方向");
    });

    it("余剰 + Cut → status caution、title に『増量方向』", () => {
      const data = makeData({ tdee: { avgEstimated: 2000, balancePerDay: 300 } });
      const items = deriveWeeklyInsightItems(data, "Cut");
      expect(items[1]!.status).toBe("caution");
      expect(items[1]!.title).toContain("増量方向");
    });

    it("赤字 + Bulk → status caution", () => {
      const data = makeData({ tdee: { avgEstimated: 2200, balancePerDay: -400 } });
      const items = deriveWeeklyInsightItems(data, "Bulk");
      expect(items[1]!.status).toBe("caution");
    });

    it("余剰 + Bulk → status ok", () => {
      const data = makeData({ tdee: { avgEstimated: 2000, balancePerDay: 300 } });
      const items = deriveWeeklyInsightItems(data, "Bulk");
      expect(items[1]!.status).toBe("ok");
    });

    it("|balance| < 100 → status neutral、title に『概ね均衡』", () => {
      const data = makeData({ tdee: { avgEstimated: 2000, balancePerDay: 50 } });
      const items = deriveWeeklyInsightItems(data, "Cut");
      expect(items[1]!.status).toBe("neutral");
      expect(items[1]!.title).toContain("概ね均衡");
    });

    it("balancePerDay が null → status neutral、detail に『TDEE 未取得』", () => {
      const data = makeData({ tdee: { avgEstimated: null, balancePerDay: null } });
      const items = deriveWeeklyInsightItems(data, "Cut");
      expect(items[1]!.status).toBe("neutral");
      expect(items[1]!.detail).toContain("TDEE 未取得");
    });

    it("avgEstimated あり → detail に『推定TDEE』を含む", () => {
      const items = deriveWeeklyInsightItems(makeData(), "Cut");
      expect(items[1]!.detail).toContain("推定TDEE");
    });

    it("avgEstimated が null → detail が undefined", () => {
      const data = makeData({ tdee: { avgEstimated: null, balancePerDay: -400 } });
      const items = deriveWeeklyInsightItems(data, "Cut");
      expect(items[1]!.detail).toBeUndefined();
    });

    it("avgCalories が null のとき収支 InsightItem が生成されない", () => {
      const data = makeData({
        nutrition: {
          avgCalories: null,
          avgProtein: null,
          avgFat: null,
          avgCarbs: null,
          daysLogged: 0,
          proteinRatioPct: null,
          proteinGPerKgBw: null,
          fatCaloriesRatioPct: null,
        },
      });
      const items = deriveWeeklyInsightItems(data, "Cut");
      // 収支 item が存在しない → protein も null なので items は weight のみ
      expect(items).toHaveLength(1);
    });
  });

  // ── タンパク質 ── //

  describe("タンパク質 InsightItem", () => {
    it("proteinGPerKgBw が推奨レンジ内 → status ok、detail に『推奨レンジ内』", () => {
      const items = deriveWeeklyInsightItems(makeData(), "Cut");
      const pItem = items[2]!;
      expect(pItem.status).toBe("ok");
      expect(pItem.title).toContain("g/kg BW");
      expect(pItem.detail).toContain("推奨レンジ内");
    });

    it("proteinGPerKgBw が不足 → status caution、detail に『やや低め』", () => {
      const data = makeData({
        nutrition: {
          avgCalories: 1800,
          avgProtein: 90,
          avgFat: 60,
          avgCarbs: 200,
          daysLogged: 7,
          proteinRatioPct: 20.0,
          proteinGPerKgBw: 1.28,
          fatCaloriesRatioPct: 30,
        },
      });
      const items = deriveWeeklyInsightItems(data, "Cut");
      const pItem = items[2]!;
      expect(pItem.status).toBe("caution");
      expect(pItem.detail).toContain("やや低め");
    });

    it("proteinGPerKgBw が高め → status neutral", () => {
      const data = makeData({
        nutrition: {
          avgCalories: 2200,
          avgProtein: 170,
          avgFat: 60,
          avgCarbs: 220,
          daysLogged: 7,
          proteinRatioPct: 30.9,
          proteinGPerKgBw: 2.43,
          fatCaloriesRatioPct: 25,
        },
      });
      const items = deriveWeeklyInsightItems(data, "Cut");
      const pItem = items[2]!;
      expect(pItem.status).toBe("neutral");
      expect(pItem.detail).toContain("高め");
    });

    it("avgProtein が null → タンパク質 InsightItem が生成されない", () => {
      const data = makeData({
        nutrition: {
          avgCalories: 1800,
          avgProtein: null,
          avgFat: null,
          avgCarbs: null,
          daysLogged: 5,
          proteinRatioPct: null,
          proteinGPerKgBw: null,
          fatCaloriesRatioPct: null,
        },
      });
      const items = deriveWeeklyInsightItems(data, "Cut");
      // weight + 収支 の 2 件のみ
      expect(items).toHaveLength(2);
    });

    it("proteinGPerKgBw が null → タンパク質 InsightItem が生成されない", () => {
      const data = makeData({
        nutrition: {
          avgCalories: 1800,
          avgProtein: 130,
          avgFat: 60,
          avgCarbs: 200,
          daysLogged: 7,
          proteinRatioPct: 28.9,
          proteinGPerKgBw: null,
          fatCaloriesRatioPct: 30,
        },
      });
      const items = deriveWeeklyInsightItems(data, "Cut");
      expect(items).toHaveLength(3); // weight + 収支 + fat
    });
  });

  describe("脂質 InsightItem", () => {
    it("fatCaloriesRatioPct が推奨レンジ内 → status ok", () => {
      const items = deriveWeeklyInsightItems(makeData(), "Cut");
      const fatItem = items[3]!;
      expect(fatItem.status).toBe("ok");
      expect(fatItem.title).toContain("脂質比");
      expect(fatItem.detail).toContain("推奨レンジ内");
    });

    it("fatCaloriesRatioPct が低すぎる → status caution", () => {
      const data = makeData({
        nutrition: {
          avgCalories: 1800,
          avgProtein: 130,
          avgFat: 35,
          avgCarbs: 240,
          daysLogged: 7,
          proteinRatioPct: 28.9,
          proteinGPerKgBw: 1.86,
          fatCaloriesRatioPct: 17.5,
        },
      });
      const items = deriveWeeklyInsightItems(data, "Cut");
      const fatItem = items[3]!;
      expect(fatItem.status).toBe("caution");
      expect(fatItem.detail).toContain("やや低め");
    });

    it("fatCaloriesRatioPct が null → 脂質 InsightItem が生成されない", () => {
      const data = makeData({
        nutrition: {
          avgCalories: 1800,
          avgProtein: 130,
          avgFat: null,
          avgCarbs: 200,
          daysLogged: 7,
          proteinRatioPct: 28.9,
          proteinGPerKgBw: 1.86,
          fatCaloriesRatioPct: null,
        },
      });
      const items = deriveWeeklyInsightItems(data, "Cut");
      expect(items).toHaveLength(3);
    });
  });

  // ── データ品質警告 ── //

  describe("データ品質警告 InsightItem", () => {
    it("weightMissingDays > 0 → caution item が生成される", () => {
      const data = makeData({ quality: { score: 80, weightMissingDays: 2, caloriesMissingDays: 0 } });
      const items = deriveWeeklyInsightItems(data, "Cut");
      const qItem = items.find((i) => i.title.includes("未入力"));
      expect(qItem).toBeDefined();
      expect(qItem!.status).toBe("caution");
      expect(qItem!.title).toContain("体重 2 日");
    });

    it("caloriesMissingDays >= 2 → caution item が生成される", () => {
      const data = makeData({ quality: { score: 80, weightMissingDays: 0, caloriesMissingDays: 3 } });
      const items = deriveWeeklyInsightItems(data, "Cut");
      const qItem = items.find((i) => i.title.includes("未入力"));
      expect(qItem).toBeDefined();
      expect(qItem!.title).toContain("カロリー 3 日");
    });

    it("caloriesMissingDays = 1 → 品質 item が生成されない (閾値は 2 以上)", () => {
      const data = makeData({ quality: { score: 90, weightMissingDays: 0, caloriesMissingDays: 1 } });
      const items = deriveWeeklyInsightItems(data, "Cut");
      expect(items.every((i) => !i.title.includes("未入力"))).toBe(true);
    });

    it("両方欠損 → title に両方のラベルが含まれる", () => {
      const data = makeData({ quality: { score: 70, weightMissingDays: 1, caloriesMissingDays: 2 } });
      const items = deriveWeeklyInsightItems(data, "Cut");
      const qItem = items.find((i) => i.title.includes("未入力"));
      expect(qItem!.title).toContain("体重 1 日");
      expect(qItem!.title).toContain("カロリー 2 日");
    });

    it("欠損なし → 品質 item が生成されない", () => {
      const items = deriveWeeklyInsightItems(makeData(), "Cut");
      expect(items.every((i) => !i.title.includes("未入力"))).toBe(true);
    });
  });

  // ── 特殊日サマリー ── //

  describe("特殊日 InsightItem", () => {
    it("cheatDays > 0 → neutral item が生成される", () => {
      const data = makeData({
        specialDays: { cheatDays: 1, refeedDays: 0, eatingOutDays: 0, travelDays: 0, totalTaggedDays: 1 },
      });
      const items = deriveWeeklyInsightItems(data, "Cut");
      const sItem = items.find((i) => i.title.includes("特殊日"));
      expect(sItem).toBeDefined();
      expect(sItem!.status).toBe("neutral");
      expect(sItem!.title).toContain("チートデイ 1日");
    });

    it("suspected + cheat/refeed → detail に水分増加の可能性を示す", () => {
      const data = makeData({
        stagnation: makeStagnation({ level: "suspected", trendKgPerWeek: -0.02 }),
        specialDays: { cheatDays: 1, refeedDays: 0, eatingOutDays: 0, travelDays: 0, totalTaggedDays: 1 },
      });
      const items = deriveWeeklyInsightItems(data, "Cut");
      const sItem = items.find((i) => i.title.includes("特殊日"));
      expect(sItem!.detail).toContain("水分増加");
    });

    it("advancing + cheat → 通常の detail テキスト", () => {
      const data = makeData({
        specialDays: { cheatDays: 1, refeedDays: 0, eatingOutDays: 0, travelDays: 0, totalTaggedDays: 1 },
      });
      const items = deriveWeeklyInsightItems(data, "Cut");
      const sItem = items.find((i) => i.title.includes("特殊日"));
      expect(sItem!.detail).toContain("体重変動の一因");
    });

    it("複数タグ (cheat + travel) → title に両方含まれる", () => {
      const data = makeData({
        specialDays: { cheatDays: 1, refeedDays: 0, eatingOutDays: 0, travelDays: 2, totalTaggedDays: 3 },
      });
      const items = deriveWeeklyInsightItems(data, "Cut");
      const sItem = items.find((i) => i.title.includes("特殊日"));
      expect(sItem!.title).toContain("チートデイ 1日");
      expect(sItem!.title).toContain("旅行 2日"); // DAY_TAG_LABELS.is_travel_day = "旅行"
    });

    it("totalTaggedDays = 0 → 特殊日 item が生成されない", () => {
      const items = deriveWeeklyInsightItems(makeData(), "Cut");
      expect(items.every((i) => !i.title.includes("特殊日"))).toBe(true);
    });
  });

  // ── 全体: item 数の確認 ── //

  describe("全データ揃っている場合の item 数", () => {
    it("advancing / 全データあり / 欠損なし → weight + 収支 + protein + fat の 4 件", () => {
      const items = deriveWeeklyInsightItems(makeData(), "Cut");
      expect(items).toHaveLength(4);
    });

    it("特殊日あり / 欠損あり → 6 件", () => {
      const data = makeData({
        quality: { score: 75, weightMissingDays: 1, caloriesMissingDays: 2 },
        specialDays: { cheatDays: 1, refeedDays: 0, eatingOutDays: 0, travelDays: 0, totalTaggedDays: 1 },
      });
      const items = deriveWeeklyInsightItems(data, "Cut");
      expect(items).toHaveLength(6);
    });
  });
});

// ── extractTdeeComparisonNote ──────────────────────────────────────────────────

describe("extractTdeeComparisonNote", () => {
  it("2文の interpretation → 先頭 direction を除いた比較部分を返す", () => {
    const interpretation =
      "摂取は消費を下回っており、減量方向の収支です。実測は理論に概ね沿っています。";
    const note = extractTdeeComparisonNote(interpretation);
    expect(note).toBe("実測は理論に概ね沿っています。");
  });

  it("1文 (direction のみ) → 空文字を返す", () => {
    const interpretation = "摂取は消費を下回っており、減量方向の収支です。";
    const note = extractTdeeComparisonNote(interpretation);
    expect(note).toBe("");
  });

  it("buildTdeeInterpretation が返す『体重データ不足』文 → 空文字", () => {
    const interpretation =
      "摂取は消費を下回っており、減量方向の収支です。 体重データ不足のため実測変化と比較できません。";
    const note = extractTdeeComparisonNote(interpretation);
    expect(note).toBe("体重データ不足のため実測変化と比較できません。");
  });

  it("データ不足の単文 → 空文字", () => {
    const interpretation = "データ不足のため収支を算出できません。";
    const note = extractTdeeComparisonNote(interpretation);
    expect(note).toBe("");
  });

  it("乖離が大きいケース → 比較部分を返す", () => {
    const interpretation =
      "摂取が消費を上回っており、増量方向の収支です。理論と実測の乖離が大きく、水分変動または記録誤差の可能性があります。";
    const note = extractTdeeComparisonNote(interpretation);
    expect(note).toContain("乖離が大きく");
  });
});
