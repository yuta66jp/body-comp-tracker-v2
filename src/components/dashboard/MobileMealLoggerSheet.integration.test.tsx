// @jest-environment jest-environment-jsdom

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";

jest.mock("lucide-react", () => ({
  ChevronRight: () => <span data-testid="icon-chevron-right" />,
  PenLine: () => <span data-testid="icon-pen-line" />,
  X: () => <span data-testid="icon-x" />,
}));

jest.mock("@/components/meal/MealLogger", () => ({
  MealLogger: ({ onSaveSuccess }: { onSaveSuccess: () => void }) => (
    <div>
      <button type="button">食事入力</button>
      <button type="button" onClick={onSaveSuccess}>
        保存する
      </button>
    </div>
  ),
}));

import { MobileMealLoggerSheet } from "./MobileMealLoggerSheet";

describe("MobileMealLoggerSheet", () => {
  afterEach(() => {
    document.body.style.overflow = "";
    jest.clearAllMocks();
  });

  it("開いた直後に閉じるボタンへフォーカスし、body スクロールを抑制する", () => {
    render(<MobileMealLoggerSheet />);

    fireEvent.click(screen.getByRole("button", { name: "食事・体重を記録する" }));

    expect(screen.getByRole("dialog", { name: "食事・体重ログ入力" })).toBeInTheDocument();
    expect(screen.getByLabelText("食事ログを閉じる")).toHaveFocus();
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("Shift+Tab と Tab でダイアログ内のフォーカスを循環する", () => {
    render(<MobileMealLoggerSheet />);

    fireEvent.click(screen.getByRole("button", { name: "食事・体重を記録する" }));

    const closeButton = screen.getByLabelText("食事ログを閉じる");
    const saveButton = screen.getByRole("button", { name: "保存する" });

    expect(closeButton).toHaveFocus();

    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(saveButton).toHaveFocus();

    fireEvent.keyDown(document, { key: "Tab" });
    expect(closeButton).toHaveFocus();
  });

  it("Escape で閉じると起動ボタンへフォーカスを戻す", () => {
    render(<MobileMealLoggerSheet />);

    const trigger = screen.getByRole("button", { name: "食事・体重を記録する" });
    fireEvent.click(trigger);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog", { name: "食事・体重ログ入力" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(document.body.style.overflow).toBe("");
  });

  it("backdrop クリックで閉じると起動ボタンへフォーカスを戻す", () => {
    render(<MobileMealLoggerSheet />);

    const trigger = screen.getByRole("button", { name: "食事・体重を記録する" });
    fireEvent.click(trigger);

    const backdrop = document.querySelector("[aria-hidden='true']") as HTMLElement;
    fireEvent.click(backdrop);

    expect(screen.queryByRole("dialog", { name: "食事・体重ログ入力" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("保存成功で閉じると起動ボタンへフォーカスを戻す", () => {
    render(<MobileMealLoggerSheet />);

    const trigger = screen.getByRole("button", { name: "食事・体重を記録する" });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "保存する" }));

    expect(screen.queryByRole("dialog", { name: "食事・体重ログ入力" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
