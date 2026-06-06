import { extractJstHHMM } from "../sleepSession";

describe("extractJstHHMM", () => {
  it("UTC 表記を JST HH:MM に変換する", () => {
    expect(extractJstHHMM("2026-04-07T14:30:00+00:00")).toBe("23:30");
    expect(extractJstHHMM("2026-04-07T22:00:00+00:00")).toBe("07:00");
  });

  it("Z suffix の UTC 表記を JST HH:MM に変換する", () => {
    expect(extractJstHHMM("2026-04-07T14:30:00Z")).toBe("23:30");
    expect(extractJstHHMM("2026-04-07T22:00:00Z")).toBe("07:00");
  });

  it("+09:00 付きの値も HH:MM として復元する", () => {
    expect(extractJstHHMM("2026-04-07T23:30:00+09:00")).toBe("23:30");
    expect(extractJstHHMM("2026-04-08T07:00:00+09:00")).toBe("07:00");
  });

  it("不正入力は null を返す", () => {
    expect(extractJstHHMM("")).toBeNull();
    expect(extractJstHHMM("invalid")).toBeNull();
    expect(extractJstHHMM("23:30")).toBeNull();
  });
});
