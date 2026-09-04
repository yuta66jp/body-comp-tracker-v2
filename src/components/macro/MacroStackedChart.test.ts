import { normalizeMacroPoint } from "./MacroStackedChart";

describe("normalizeMacroPoint", () => {
  it("未記録は 0% や炭水化物 100% にせず空白データにする", () => {
    expect(normalizeMacroPoint({ date: "09-03", protein: null, fat: null, carbs: null })).toEqual({
      date: "09-03",
      タンパク質: null,
      脂質: null,
      炭水化物: null,
    });
    expect(normalizeMacroPoint({ date: "09-03", protein: 0, fat: 0, carbs: 0 })).toEqual({
      date: "09-03",
      タンパク質: null,
      脂質: null,
      炭水化物: null,
    });
  });

  it("記録済み PFC は合計 100% にする", () => {
    const point = normalizeMacroPoint({ date: "09-04", protein: 150, fat: 50, carbs: 200 });
    expect(point.タンパク質! + point.脂質! + point.炭水化物!).toBe(100);
  });
});
