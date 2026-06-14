import { MEAL_TYPE_LABELS, MEAL_TYPES } from "./meals";

describe("meal labels", () => {
  it("MEAL 1〜4 / Other の表示ラベルを返す", () => {
    expect(MEAL_TYPES).toEqual(["meal_1", "meal_2", "meal_3", "meal_4", "other"]);
    expect(MEAL_TYPE_LABELS).toEqual({
      meal_1: "MEAL 1",
      meal_2: "MEAL 2",
      meal_3: "MEAL 3",
      meal_4: "MEAL 4",
      other: "Other",
    });
  });
});
