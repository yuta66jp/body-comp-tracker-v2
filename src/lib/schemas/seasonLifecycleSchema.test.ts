import {
  parseSeasonEndInput,
  parseSeasonGoalInput,
  parseSeasonStartInput,
} from "./seasonLifecycleSchema";

describe("parseSeasonStartInput", () => {
  const valid = {
    expectedActiveSeasonId: null,
    name: "2026_Cut",
    phase: "Cut",
    startDate: "2026-04-01",
    targetDate: "2026-08-30",
    targetWeight: "68.5",
  };

  it("JST calendar dateと体重を変換する", () => {
    expect(parseSeasonStartInput(valid, "2026-04-01")).toEqual({
      ok: true,
      data: { ...valid, phase: "Cut", targetWeight: 68.5 },
    });
  });

  it("未来の開始日、開始日前の目標日、不正体重を拒否する", () => {
    const result = parseSeasonStartInput(
      { ...valid, startDate: "2026-04-02", targetDate: "2026-04-01", targetWeight: "201" },
      "2026-04-01"
    );
    expect(result).toMatchObject({
      ok: false,
      errors: expect.arrayContaining([
        expect.objectContaining({ field: "startDate" }),
        expect.objectContaining({ field: "targetDate" }),
        expect.objectContaining({ field: "targetWeight" }),
      ]),
    });
  });
});

describe("parseSeasonEndInput", () => {
  it("今日以前の実在日を受け入れる", () => {
    expect(parseSeasonEndInput({ expectedActiveSeasonId: 1, endDate: "2026-04-01" }, "2026-04-02")).toEqual({
      ok: true,
      data: { expectedActiveSeasonId: 1, endDate: "2026-04-01" },
    });
  });

  it("未来日を拒否する", () => {
    expect(parseSeasonEndInput({ expectedActiveSeasonId: 1, endDate: "2026-04-03" }, "2026-04-02")).toMatchObject({
      ok: false,
      errors: [{ field: "endDate" }],
    });
  });
});

describe("parseSeasonGoalInput", () => {
  it("実在日と20〜200kgだけを受け入れる", () => {
    expect(parseSeasonGoalInput({ expectedActiveSeasonId: 1, targetDate: "2026-02-30", targetWeight: "19" })).toMatchObject({
      ok: false,
      errors: expect.arrayContaining([
        expect.objectContaining({ field: "targetDate" }),
        expect.objectContaining({ field: "targetWeight" }),
      ]),
    });
  });
});
