import { formatCaloriesWithDiff, getNormalizedDiffWidth } from "./calorieDiff";

describe("formatCaloriesWithDiff", () => {
  test("positive diff adds + prefix", () => {
    expect(formatCaloriesWithDiff(2183, 200)).toBe("2,183 (+200)");
  });

  test("negative diff shows minus sign without extra prefix", () => {
    expect(formatCaloriesWithDiff(1900, -100)).toBe("1,900 (-100)");
  });

  test("zero diff shows (0) with no sign", () => {
    expect(formatCaloriesWithDiff(2000, 0)).toBe("2,000 (0)");
  });

  test("large actual value uses comma separator", () => {
    expect(formatCaloriesWithDiff(3500, 500)).toBe("3,500 (+500)");
  });

  test("rounds non-integer diff", () => {
    expect(formatCaloriesWithDiff(2000, 50.7)).toBe("2,000 (+51)");
  });

  test("rounds non-integer actual", () => {
    expect(formatCaloriesWithDiff(2183.4, 0)).toBe("2,183 (0)");
  });

  test("negative diff rounds correctly", () => {
    expect(formatCaloriesWithDiff(1800, -50.3)).toBe("1,800 (-50)");
  });
});

describe("getNormalizedDiffWidth", () => {
  test("returns 0 when maxAbs is 0 (zero-division guard)", () => {
    expect(getNormalizedDiffWidth(100, 0)).toBe(0);
  });

  test("returns 1 when diff equals maxAbs", () => {
    expect(getNormalizedDiffWidth(200, 200)).toBe(1);
  });

  test("returns proportional ratio for positive diff", () => {
    expect(getNormalizedDiffWidth(100, 200)).toBe(0.5);
  });

  test("uses absolute value for negative diff", () => {
    expect(getNormalizedDiffWidth(-150, 200)).toBe(0.75);
  });

  test("clamps to 1 when diff exceeds maxAbs", () => {
    expect(getNormalizedDiffWidth(300, 200)).toBe(1);
  });

  test("returns 0 for diff = 0", () => {
    expect(getNormalizedDiffWidth(0, 200)).toBe(0);
  });
});
