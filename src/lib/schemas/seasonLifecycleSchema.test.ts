import {
  parseCompletedSeasonEditInput,
  parseSeasonEndInput,
  parseSeasonGoalInput,
  parseSeasonPlanOverridesInput,
  parseSeasonStartInput,
} from "./seasonLifecycleSchema";

describe("parseCompletedSeasonEditInput", () => {
  const valid = {
    expectedCompletedSeasonId: 10,
    expectedCompletedSeasonUpdatedAt: "2026-04-01T00:00:00Z",
    name: " 2025_Cut ",
    phase: "Cut",
    endDate: "2026-03-31",
  };

  it("名称をtrimし、終了済みseasonの編集入力を受け入れる", () => {
    expect(parseCompletedSeasonEditInput(valid, "2026-04-01")).toEqual({
      ok: true,
      data: { ...valid, name: "2025_Cut", phase: "Cut" },
    });
  });

  it("不正な識別子・phase・未来日を拒否する", () => {
    expect(parseCompletedSeasonEditInput({
      ...valid,
      expectedCompletedSeasonId: 0,
      expectedCompletedSeasonUpdatedAt: "invalid",
      phase: "Maintain",
      endDate: "2026-04-02",
    }, "2026-04-01")).toMatchObject({
      ok: false,
      errors: expect.arrayContaining([
        expect.objectContaining({ field: "season" }),
        expect.objectContaining({ field: "phase" }),
        expect.objectContaining({ field: "endDate" }),
      ]),
    });
  });
});

describe("parseSeasonStartInput", () => {
  const valid = {
    expectedActiveSeasonId: null,
    expectedActiveSeasonUpdatedAt: null,
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
    expect(parseSeasonEndInput({ expectedActiveSeasonId: 1, expectedActiveSeasonUpdatedAt: "2026-04-01T00:00:00Z", endDate: "2026-04-01" }, "2026-04-02")).toEqual({
      ok: true,
      data: { expectedActiveSeasonId: 1, expectedActiveSeasonUpdatedAt: "2026-04-01T00:00:00Z", endDate: "2026-04-01" },
    });
  });

  it("未来日を拒否する", () => {
    expect(parseSeasonEndInput({ expectedActiveSeasonId: 1, expectedActiveSeasonUpdatedAt: "2026-04-01T00:00:00Z", endDate: "2026-04-03" }, "2026-04-02")).toMatchObject({
      ok: false,
      errors: [{ field: "endDate" }],
    });
  });
});

describe("parseSeasonGoalInput", () => {
  it("実在日と20〜200kgだけを受け入れる", () => {
    expect(parseSeasonGoalInput({ expectedActiveSeasonId: 1, expectedActiveSeasonUpdatedAt: "2026-04-01T00:00:00Z", targetDate: "2026-02-30", targetWeight: "19" })).toMatchObject({
      ok: false,
      errors: expect.arrayContaining([
        expect.objectContaining({ field: "targetDate" }),
        expect.objectContaining({ field: "targetWeight" }),
      ]),
    });
  });
});

describe("parseSeasonPlanOverridesInput", () => {
  const base = {
    expectedActiveSeasonId: 1,
    expectedActiveSeasonUpdatedAt: "2026-04-01T00:00:00Z",
    overrides: [{ month: "2026-05", targetWeight: 70 }],
    resetAll: false,
  };

  it("20〜200kgの重複しないoverrideを受け入れる", () => {
    expect(parseSeasonPlanOverridesInput(base)).toEqual({ ok: true, data: base });
  });

  it("範囲外体重と重複月を拒否する", () => {
    expect(parseSeasonPlanOverridesInput({
      ...base,
      overrides: [
        { month: "2026-05", targetWeight: 201 },
        { month: "2026-05", targetWeight: 70 },
      ],
    })).toMatchObject({
      ok: false,
      errors: expect.arrayContaining([
        expect.objectContaining({ field: "overrides" }),
      ]),
    });
  });

  it("全件リセットでは空配列だけを受け入れる", () => {
    expect(parseSeasonPlanOverridesInput({ ...base, overrides: [], resetAll: true })).toMatchObject({ ok: true });
    expect(parseSeasonPlanOverridesInput({ ...base, resetAll: true })).toMatchObject({ ok: false });
  });
});
