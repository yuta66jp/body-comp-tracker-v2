import { makeTooltipFormatter } from "./rechartsFormatter";

describe("makeTooltipFormatter", () => {
  describe("value フォーマット", () => {
    it("有限数値を formatValue に渡す", () => {
      const fmt = makeTooltipFormatter((v) => `${v.toFixed(1)} kg`);
      expect(fmt(68.3, "actual")).toEqual(["68.3 kg", "actual"]);
    });

    it("整数値でも formatValue を適用する", () => {
      const fmt = makeTooltipFormatter((v) => `${v} g`);
      expect(fmt(150, "タンパク質")).toEqual(["150 g", "タンパク質"]);
    });

    it("value が undefined のとき '—' を返す", () => {
      const fmt = makeTooltipFormatter((v) => `${v.toFixed(1)} kg`);
      expect(fmt(undefined, "actual")).toEqual(["—", "actual"]);
    });

    it("value が NaN のとき '—' を返す", () => {
      const fmt = makeTooltipFormatter((v) => `${v.toFixed(1)} kg`);
      expect(fmt(NaN, "actual")).toEqual(["—", "actual"]);
    });

    it("value が Infinity のとき '—' を返す", () => {
      const fmt = makeTooltipFormatter((v) => `${v.toFixed(1)} kg`);
      expect(fmt(Infinity, "actual")).toEqual(["—", "actual"]);
    });

    it("value が文字列のとき '—' を返す（TooltipValueType は string も含む）", () => {
      const fmt = makeTooltipFormatter((v) => `${v.toFixed(1)} kg`);
      expect(fmt("not-a-number", "actual")).toEqual(["—", "actual"]);
    });
  });

  describe("name マッパー", () => {
    it("nameMapper 省略時は name をそのまま文字列化して返す", () => {
      const fmt = makeTooltipFormatter((v) => `${v.toFixed(1)} kg`);
      expect(fmt(70, "sma7")).toEqual(["70.0 kg", "sma7"]);
    });

    it("name が undefined のとき空文字列を返す", () => {
      const fmt = makeTooltipFormatter((v) => `${v} g`);
      expect(fmt(100, undefined)).toEqual(["100 g", ""]);
    });

    it("Record<string, string> で name を変換する", () => {
      const fmt = makeTooltipFormatter((v) => `${v.toFixed(1)} kg`, {
        actual: "実測",
        sma7: "7日平均",
      });
      expect(fmt(68.0, "actual")).toEqual(["68.0 kg", "実測"]);
      expect(fmt(68.0, "sma7")).toEqual(["68.0 kg", "7日平均"]);
    });

    it("Record にない name はそのまま返す", () => {
      const fmt = makeTooltipFormatter((v) => `${v.toFixed(1)} kg`, {
        actual: "実測",
      });
      expect(fmt(68.0, "forecast")).toEqual(["68.0 kg", "forecast"]);
    });

    it("関数 nameMapper で name を変換する", () => {
      const fmt = makeTooltipFormatter(
        (v) => `${v}%`,
        () => "重要度（相対値）",
      );
      expect(fmt(45, "pct")).toEqual(["45%", "重要度（相対値）"]);
    });

    it("関数 nameMapper で MODEL_CONFIG 参照パターン", () => {
      const config: Record<string, { label: string }> = {
        NeuralProphet: { label: "AI予測" },
      };
      const fmt = makeTooltipFormatter(
        (v) => `${v.toFixed(3)} kg`,
        (name) => config[name]?.label ?? name,
      );
      expect(fmt(0.234, "NeuralProphet")).toEqual(["0.234 kg", "AI予測"]);
      expect(fmt(0.234, "Naive")).toEqual(["0.234 kg", "Naive"]);
    });
  });
});
