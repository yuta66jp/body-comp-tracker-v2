/**
 * SettingsForm UI 結合テスト
 *
 * テスト戦略:
 * - saveSettings (server action) を jest.mock() でモックし、ネットワーク依存を排除する
 * - lucide-react はアイコン名を持つ span に差し替えてレンダリングを単純化する
 * - jest.useFakeTimers() と userEvent の競合を避けるため、ボタン操作は fireEvent を使う
 *
 * 検証内容:
 * 1. 保存成功: saveSettings が { ok: true } を返すとき「保存しました」が表示される
 * 2. 保存失敗（バリデーションエラー）: { ok: false } を返すとき「保存に失敗しました」とフィールドエラーが表示される
 * 3. 保存中: ボタンが無効化され「保存中...」が表示される
 */

// @jest-environment jest-environment-jsdom

import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

// saveSettings server action をモック
jest.mock("@/app/settings/actions", () => ({
  saveSettings: jest.fn(),
}));

// lucide-react をシンプルな span に差し替えてアイコンのレンダリングを安定させる
jest.mock("lucide-react", () => ({
  Save: () => <span data-testid="icon-save" />,
  CheckCircle2: () => <span data-testid="icon-check" />,
  AlertCircle: () => <span data-testid="icon-alert" />,
  Loader2: () => <span data-testid="icon-loader" />,
}));

import { saveSettings } from "@/app/settings/actions";
import { SettingsForm } from "@/components/settings/SettingsForm";
import type { SaveSettingsResult } from "@/app/settings/actions";
import type { Setting } from "@/lib/supabase/types";

const mockSaveSettings = saveSettings as jest.MockedFunction<
  (input: Parameters<typeof saveSettings>[0]) => Promise<SaveSettingsResult>
>;

/** テスト用の最小限の Setting[] 初期値 */
const emptySettings: Setting[] = [];

// ─── シナリオ 1: 保存成功 ────────────────────────────────────────────────────

describe("SettingsForm — 保存成功", () => {
  beforeEach(() => {
    mockSaveSettings.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  it("保存ボタンをクリックすると saveSettings が呼ばれ「保存しました」が表示される", async () => {
    render(<SettingsForm initialSettings={emptySettings} />);

    // 保存ボタンをクリックする
    const saveButton = screen.getByRole("button", { name: /保存/ });
    fireEvent.click(saveButton);

    // saveSettings が呼ばれたことを確認する
    await waitFor(() => {
      expect(mockSaveSettings).toHaveBeenCalledTimes(1);
    });

    // 成功メッセージが表示されることを確認する
    await waitFor(() => {
      expect(screen.getByText("保存しました")).toBeInTheDocument();
    });
  });

  it("saveSettings に全フィールドが渡される", async () => {
    render(<SettingsForm initialSettings={emptySettings} />);

    const saveButton = screen.getByRole("button", { name: /保存/ });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockSaveSettings).toHaveBeenCalledTimes(1);
    });

    // 渡された引数に必須フィールドが含まれることを確認する
    const callArg = mockSaveSettings.mock.calls[0][0];
    expect(callArg).toHaveProperty("contest_date");
    expect(callArg).toHaveProperty("goal_weight");
    expect(callArg).toHaveProperty("activity_factor");
  });

  it("保存成功後にステータスが idle に戻ると「保存しました」が消える", async () => {
    jest.useFakeTimers({ advanceTimers: false });

    render(<SettingsForm initialSettings={emptySettings} />);

    const saveButton = screen.getByRole("button", { name: /保存/ });
    fireEvent.click(saveButton);

    // Promise の解決を待つ
    await act(async () => {
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByText("保存しました")).toBeInTheDocument();
    });

    // 2000ms 後に idle に戻る（SettingsForm の setTimeout(2000)）
    act(() => {
      jest.advanceTimersByTime(2500);
    });

    await waitFor(() => {
      expect(screen.queryByText("保存しました")).not.toBeInTheDocument();
    });
  });
});

// ─── シナリオ 2: 保存失敗（バリデーションエラー） ───────────────────────────

describe("SettingsForm — 保存失敗（バリデーションエラー）", () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  it("saveSettings が { ok: false } を返すと「保存に失敗しました」が表示される", async () => {
    mockSaveSettings.mockResolvedValue({
      ok: false,
      error: "入力値が不正です。goal_weight: 正の数値を入力してください",
    });

    render(<SettingsForm initialSettings={emptySettings} />);

    const saveButton = screen.getByRole("button", { name: /保存/ });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText("保存に失敗しました")).toBeInTheDocument();
    });
  });

  it("フィールドエラーメッセージが該当フィールドの下に表示される", async () => {
    mockSaveSettings.mockResolvedValue({
      ok: false,
      error: "入力値が不正です。goal_weight: 正の数値を入力してください, age: 正の整数を入力してください",
    });

    render(<SettingsForm initialSettings={emptySettings} />);

    const saveButton = screen.getByRole("button", { name: /保存/ });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText("正の数値を入力してください")).toBeInTheDocument();
      expect(screen.getByText("正の整数を入力してください")).toBeInTheDocument();
    });
  });

  it("エラー状態は 3000ms 後に idle に戻る", async () => {
    jest.useFakeTimers({ advanceTimers: false });

    mockSaveSettings.mockResolvedValue({
      ok: false,
      error: "入力値が不正です。goal_weight: 正の数値を入力してください",
    });

    render(<SettingsForm initialSettings={emptySettings} />);

    const saveButton = screen.getByRole("button", { name: /保存/ });
    fireEvent.click(saveButton);

    await act(async () => {
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByText("保存に失敗しました")).toBeInTheDocument();
    });

    act(() => {
      jest.advanceTimersByTime(3500);
    });

    await waitFor(() => {
      expect(screen.queryByText("保存に失敗しました")).not.toBeInTheDocument();
    });
  });
});

// ─── シナリオ 3: 保存中ステータス ──────────────────────────────────────────

describe("SettingsForm — 保存中ステータス", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("保存中はボタンが disabled になり「保存中...」テキストが表示される", async () => {
    // saveSettings が解決されない Promise を返して「保存中」状態を維持する
    mockSaveSettings.mockImplementation(
      () => new Promise<SaveSettingsResult>(() => {})
    );

    render(<SettingsForm initialSettings={emptySettings} />);

    const saveButton = screen.getByRole("button", { name: /保存/ });
    fireEvent.click(saveButton);

    // ボタンが disabled になる
    await waitFor(() => {
      expect(saveButton).toBeDisabled();
    });

    // 「保存中...」テキストが表示される
    expect(screen.getByText("保存中...")).toBeInTheDocument();
  });
});

// ─── シナリオ 4: フォームの初期値反映 ──────────────────────────────────────

describe("SettingsForm — 初期値の反映", () => {
  it("initialSettings の数値フィールドがフォームに反映される", () => {
    const settings: Setting[] = [
      { key: "goal_weight", value_num: 60.5, value_str: null },
      { key: "age",         value_num: 28,   value_str: null },
    ];

    render(<SettingsForm initialSettings={settings} />);

    // goal_weight の input に 60.5 が反映されていることを確認する
    const goalWeightInput = screen.getByPlaceholderText("58.5") as HTMLInputElement;
    expect(goalWeightInput.value).toBe("60.5");

    // age の input に 28 が反映されていることを確認する
    const ageInput = screen.getByPlaceholderText("30") as HTMLInputElement;
    expect(ageInput.value).toBe("28");
  });

  it("initialSettings の文字列フィールドがフォームに反映される", () => {
    const settings: Setting[] = [
      { key: "current_season", value_num: null, value_str: "2026_TokyoNovice" },
    ];

    render(<SettingsForm initialSettings={settings} />);

    const seasonInput = screen.getByPlaceholderText("2026_TokyoNovice") as HTMLInputElement;
    expect(seasonInput.value).toBe("2026_TokyoNovice");
  });
});
