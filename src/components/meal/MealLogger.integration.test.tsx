/**
 * MealLogger 保存順序 回帰テスト (#528)
 *
 * 新規 daily_logs 作成を伴う保存で、
 * saveDailyLog → saveSleepSession の順序が守られることを検証する。
 *
 * 【不具合の再現条件】
 * 保存順序が逆（saveSleepSession → saveDailyLog）だと:
 * 1. sleep_sessions upsert → DB トリガー (trg_sync_sleep_hours) 発火
 * 2. `UPDATE daily_logs SET sleep_hours=... WHERE log_date=wake_date` を実行
 * 3. しかし daily_logs 行がまだ存在しないため UPDATE 0 行で終了
 * 4. その後 saveDailyLog が daily_logs 行を新規 INSERT するが sleep_hours は NULL のまま
 *
 * 【修正後の正しい順序】
 * 1. saveDailyLog → daily_logs 行を新規作成（sleep_hours は一時的に NULL）
 * 2. saveSleepSession → DB トリガーが発火し、既存の daily_logs 行の sleep_hours を更新
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// ── モック定義 ────────────────────────────────────────────────────────────────
// jest.mock は jest の babel transform でファイル先頭にホイストされるため、
// 変数への参照を避けて素直な factory として定義し、
// 実際のモック挙動 (callOrder 記録) は beforeEach の mockImplementation で設定する。

jest.mock("@/app/actions/saveDailyLog", () => ({
  saveDailyLog: jest.fn(async () => ({ ok: true })),
}));

jest.mock("@/app/actions/saveSleepSession", () => ({
  saveSleepSession: jest.fn(async () => ({ ok: true })),
  deleteSleepSession: jest.fn(async () => ({ ok: true })),
}));

// SWR フックをモック: 空データ（新規日付 = 既存ログなし）
jest.mock("@/lib/hooks/useDailyLogs", () => ({
  useDailyLogs: () => ({ data: [], mutate: jest.fn() }),
}));

jest.mock("@/lib/hooks/useSleepSessions", () => ({
  useSleepSessions: () => ({ data: [], mutate: jest.fn() }),
}));

// Cart と calcCartTotals のモック
jest.mock("./Cart", () => ({
  Cart: () => null,
  calcCartTotals: () => ({ calories: 0, protein: 0, fat: 0, carbs: 0 }),
}));

// FoodPicker のモック
jest.mock("./FoodPicker", () => ({
  FoodPicker: () => null,
}));

// Toast のモック
jest.mock("@/components/ui/Toast", () => ({
  Toast: () => null,
}));

// lucide-react のモック（アイコンを span に差し替えてレンダリングを安定させる）
jest.mock("lucide-react", () => ({
  Loader2:     () => <span data-testid="icon-loader" />,
  PenLine:     () => <span data-testid="icon-penline" />,
  X:           () => <span data-testid="icon-x" />,
  Undo2:       () => <span data-testid="icon-undo2" />,
  ChevronDown: () => <span data-testid="icon-chevron-down" />,
  Plus:        () => <span data-testid="icon-plus" />,
}));

// toJstDateStr を固定日付に差し替える（テスト日依存を排除）
jest.mock("@/lib/utils/date", () => ({
  ...jest.requireActual<typeof import("@/lib/utils/date")>("@/lib/utils/date"),
  toJstDateStr: () => "2026-04-10",
}));

// ── モジュールのインポート（jest.mock より後に配置）─────────────────────────────
import { saveDailyLog } from "@/app/actions/saveDailyLog";
import { saveSleepSession } from "@/app/actions/saveSleepSession";
import { MealLogger } from "./MealLogger";

const mockSaveDailyLog    = saveDailyLog    as jest.Mock;
const mockSaveSleepSession = saveSleepSession as jest.Mock;

// ─── セットアップ ─────────────────────────────────────────────────────────────

let callOrder: string[] = [];

beforeEach(() => {
  callOrder = [];

  mockSaveDailyLog.mockImplementation(async () => {
    callOrder.push("saveDailyLog");
    return { ok: true };
  });

  mockSaveSleepSession.mockImplementation(async () => {
    callOrder.push("saveSleepSession");
    return { ok: true };
  });
});

afterEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();
});

// ─── テスト ───────────────────────────────────────────────────────────────────

describe("MealLogger handleSave — 保存順序 (#528 回帰)", () => {
  /**
   * 新規日付 + 体重 + 睡眠の保存:
   * saveDailyLog が saveSleepSession より先に呼ばれることを検証する。
   *
   * これが逆順だと DB トリガー (trg_sync_sleep_hours) が発火した時点で
   * daily_logs 行が存在せず、sleep_hours が null のまま残る (#528)。
   */
  it("新規日付: 体重 + 睡眠を同時保存するとき saveDailyLog が saveSleepSession より先に呼ばれる", async () => {
    render(<MealLogger />);

    // 体重を入力（daily_logs の変更フラグを立てる）
    const weightInput = screen.getByLabelText(/体重/);
    fireEvent.change(weightInput, { target: { value: "70.5" } });

    // 就寝時刻を入力
    const bedTimeInput = screen.getByLabelText(/就寝時刻/);
    fireEvent.change(bedTimeInput, { target: { value: "23:00" } });

    // 起床時刻を入力
    const wakeTimeInput = screen.getByLabelText(/起床時刻/);
    fireEvent.change(wakeTimeInput, { target: { value: "07:00" } });

    // 保存ボタンをクリック
    const saveButton = screen.getByRole("button", { name: /保存/ });
    fireEvent.click(saveButton);

    // 両方の保存が呼ばれるのを待つ
    await waitFor(() => {
      expect(mockSaveDailyLog).toHaveBeenCalledTimes(1);
      expect(mockSaveSleepSession).toHaveBeenCalledTimes(1);
    });

    // saveDailyLog → saveSleepSession の順序を検証
    expect(callOrder).toEqual(["saveDailyLog", "saveSleepSession"]);
  });

  /**
   * 睡眠のみ変更（体重などの daily_logs 変更なし）:
   * saveDailyLog は呼ばれず、saveSleepSession のみ呼ばれることを検証する。
   * 既存日の場合、sleep_sessions 保存 → DB トリガーで既存行の sleep_hours が更新される。
   */
  it("睡眠のみ変更のとき saveDailyLog は呼ばれず saveSleepSession のみ呼ばれる", async () => {
    render(<MealLogger />);

    // 就寝時刻のみ入力（daily_logs 変更なし）
    const bedTimeInput = screen.getByLabelText(/就寝時刻/);
    fireEvent.change(bedTimeInput, { target: { value: "22:30" } });

    const wakeTimeInput = screen.getByLabelText(/起床時刻/);
    fireEvent.change(wakeTimeInput, { target: { value: "06:30" } });

    const saveButton = screen.getByRole("button", { name: /保存/ });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockSaveSleepSession).toHaveBeenCalledTimes(1);
    });

    // daily_logs 変更なし → saveDailyLog は呼ばれない
    expect(mockSaveDailyLog).not.toHaveBeenCalled();
    expect(callOrder).toEqual(["saveSleepSession"]);
  });

  /**
   * saveSleepSession の呼び出し引数を検証する。
   * wake_date が画面の日付 (2026-04-10) と一致することを確認。
   */
  it("saveSleepSession は正しい wake_date と時刻で呼ばれる", async () => {
    render(<MealLogger />);

    const weightInput = screen.getByLabelText(/体重/);
    fireEvent.change(weightInput, { target: { value: "68.0" } });

    const bedTimeInput = screen.getByLabelText(/就寝時刻/);
    fireEvent.change(bedTimeInput, { target: { value: "23:30" } });

    const wakeTimeInput = screen.getByLabelText(/起床時刻/);
    fireEvent.change(wakeTimeInput, { target: { value: "07:30" } });

    const saveButton = screen.getByRole("button", { name: /保存/ });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockSaveSleepSession).toHaveBeenCalledTimes(1);
    });

    expect(mockSaveSleepSession).toHaveBeenCalledWith({
      wake_date: "2026-04-10",
      bed_time:  "23:30",
      wake_time: "07:30",
    });
  });

  /**
   * saveDailyLog が失敗した場合、saveSleepSession は呼ばれない。
   * 新規日付で daily_logs 作成が失敗した場合に孤立した sleep_sessions 行を作らない。
   */
  it("saveDailyLog が失敗したとき saveSleepSession は呼ばれない", async () => {
    mockSaveDailyLog.mockImplementationOnce(async () => {
      callOrder.push("saveDailyLog");
      return { ok: false, message: "新しい日付を作成するには体重の入力が必要です" };
    });

    render(<MealLogger />);

    const weightInput = screen.getByLabelText(/体重/);
    fireEvent.change(weightInput, { target: { value: "70.0" } });

    const bedTimeInput = screen.getByLabelText(/就寝時刻/);
    fireEvent.change(bedTimeInput, { target: { value: "23:00" } });

    const wakeTimeInput = screen.getByLabelText(/起床時刻/);
    fireEvent.change(wakeTimeInput, { target: { value: "07:00" } });

    const saveButton = screen.getByRole("button", { name: /保存/ });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockSaveDailyLog).toHaveBeenCalledTimes(1);
    });

    // saveDailyLog 失敗後 → saveSleepSession は呼ばれない
    expect(mockSaveSleepSession).not.toHaveBeenCalled();
    expect(callOrder).toEqual(["saveDailyLog"]);
  });
});
