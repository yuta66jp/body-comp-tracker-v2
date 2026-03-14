import {
  getBalanceStatus,
  getBalanceBarColors,
  getBalanceTextColor,
  type CurrentPhase,
} from "./energyBalance";

describe("getBalanceStatus", () => {
  describe("Cut phase", () => {
    const phase: CurrentPhase = "Cut";
    test("negative balance is good (calorie deficit = target)", () => {
      expect(getBalanceStatus(-200, phase)).toBe("good");
    });
    test("positive balance is bad (calorie surplus in cut)", () => {
      expect(getBalanceStatus(200, phase)).toBe("bad");
    });
    test("zero balance is neutral", () => {
      expect(getBalanceStatus(0, phase)).toBe("neutral");
    });
  });

  describe("Bulk phase", () => {
    const phase: CurrentPhase = "Bulk";
    test("positive balance is good (calorie surplus = target)", () => {
      expect(getBalanceStatus(200, phase)).toBe("good");
    });
    test("negative balance is bad (calorie deficit in bulk)", () => {
      expect(getBalanceStatus(-200, phase)).toBe("bad");
    });
    test("zero balance is neutral", () => {
      expect(getBalanceStatus(0, phase)).toBe("neutral");
    });
  });

  describe("null phase (unknown / unset)", () => {
    test("negative balance → neutral", () => {
      expect(getBalanceStatus(-200, null)).toBe("neutral");
    });
    test("positive balance → neutral", () => {
      expect(getBalanceStatus(200, null)).toBe("neutral");
    });
    test("zero balance → neutral", () => {
      expect(getBalanceStatus(0, null)).toBe("neutral");
    });
  });
});

describe("getBalanceBarColors", () => {
  test("Cut: left=emerald (good/deficit), right=rose (bad/surplus)", () => {
    const { leftColor, rightColor } = getBalanceBarColors("Cut");
    expect(leftColor).toContain("emerald");
    expect(rightColor).toContain("rose");
  });

  test("Bulk: left=rose (bad/deficit), right=emerald (good/surplus)", () => {
    const { leftColor, rightColor } = getBalanceBarColors("Bulk");
    expect(leftColor).toContain("rose");
    expect(rightColor).toContain("emerald");
  });

  test("null phase: both sides neutral (slate)", () => {
    const { leftColor, rightColor } = getBalanceBarColors(null);
    expect(leftColor).toContain("slate");
    expect(rightColor).toContain("slate");
  });
});

describe("getBalanceTextColor", () => {
  test("zero balance → neutral gray", () => {
    expect(getBalanceTextColor(0, "Cut")).toBe("text-slate-400");
  });

  test("Cut + negative → good color (emerald)", () => {
    expect(getBalanceTextColor(-100, "Cut")).toContain("emerald");
  });

  test("Cut + positive → bad color (rose)", () => {
    expect(getBalanceTextColor(100, "Cut")).toContain("rose");
  });

  test("Bulk + positive → good color (emerald)", () => {
    expect(getBalanceTextColor(100, "Bulk")).toContain("emerald");
  });

  test("Bulk + negative → bad color (rose)", () => {
    expect(getBalanceTextColor(-100, "Bulk")).toContain("rose");
  });

  test("null phase → neutral gray regardless of sign", () => {
    expect(getBalanceTextColor(-100, null)).toBe("text-slate-400");
    expect(getBalanceTextColor(100, null)).toBe("text-slate-400");
  });
});
