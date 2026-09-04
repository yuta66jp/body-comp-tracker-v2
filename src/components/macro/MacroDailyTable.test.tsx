/** @jest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { MacroDailyTable } from "./MacroDailyTable";

describe("MacroDailyTable", () => {
  it("食事未記録日は 0 kcal や目標差分を表示しない", () => {
    render(
      <MacroDailyTable
        calTarget={2000}
        data={[{
          fullDate: "2026-09-03",
          calories: null,
          protein: null,
          fat: null,
          carbs: null,
        }]}
      />
    );

    expect(screen.getAllByText("未記録").length).toBeGreaterThan(0);
    expect(screen.queryByText(/-2,?000/)).not.toBeInTheDocument();
  });
});
