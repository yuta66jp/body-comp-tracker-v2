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
import type { DailyLog, SleepSession } from "@/lib/supabase/types";

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

let mockDailyLogs: DailyLog[] | undefined = [];
let mockSleepSessions: SleepSession[] | undefined = [];

// SWR フックをモック: テストごとに既存ログ有無を切り替える
jest.mock("@/lib/hooks/useDailyLogs", () => ({
  useDailyLogs: () => ({ data: mockDailyLogs, mutate: jest.fn() }),
}));

jest.mock("@/lib/hooks/useSleepSessions", () => ({
  useSleepSessions: () => ({ data: mockSleepSessions, mutate: jest.fn() }),
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

// Toast のモック（visible=true のとき message を DOM に出力してテスト可能にする）
jest.mock("@/components/ui/Toast", () => ({
  Toast: ({ message, visible }: { message: string; visible: boolean }) =>
    visible ? <div data-testid="toast-message">{message}</div> : null,
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
  mockDailyLogs = [];
  mockSleepSessions = [];

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
   * 新規日付で睡眠のみ変更（体重などの daily_logs 変更なし）:
   * daily_logs 行がない状態で sleep_sessions だけを作ると sleep_hours 同期が 0 行更新になる。
   * そのため saveDailyLog / saveSleepSession ともに呼ばず、体重入力を促す。
   */
  it("新規日付: 睡眠のみ変更のとき saveDailyLog / saveSleepSession ともに呼ばれない", async () => {
    render(<MealLogger />);

    // 就寝時刻のみ入力（daily_logs 変更なし）
    const bedTimeInput = screen.getByLabelText(/就寝時刻/);
    fireEvent.change(bedTimeInput, { target: { value: "22:30" } });

    const wakeTimeInput = screen.getByLabelText(/起床時刻/);
    fireEvent.change(wakeTimeInput, { target: { value: "06:30" } });

    const saveButton = screen.getByRole("button", { name: /保存/ });
    fireEvent.click(saveButton);

    await waitFor(() => {
      const toast = screen.queryByTestId("toast-message");
      expect(toast).not.toBeNull();
      expect(toast?.textContent).toContain("体重も入力してください");
    });

    expect(mockSaveDailyLog).not.toHaveBeenCalled();
    expect(mockSaveSleepSession).not.toHaveBeenCalled();
    expect(callOrder).toEqual([]);
  });

  /**
   * daily_logs が未ロードの状態で睡眠のみ変更:
   * 既存日付か新規日付か判定できないため、sleep_sessions だけを先に保存しない。
   */
  it("daily_logs 未ロード: 睡眠のみ変更のとき確認中メッセージを表示し保存しない", async () => {
    mockDailyLogs = undefined;

    render(<MealLogger />);

    const bedTimeInput = screen.getByLabelText(/就寝時刻/);
    fireEvent.change(bedTimeInput, { target: { value: "22:30" } });

    const wakeTimeInput = screen.getByLabelText(/起床時刻/);
    fireEvent.change(wakeTimeInput, { target: { value: "06:30" } });

    const saveButton = screen.getByRole("button", { name: /保存/ });
    fireEvent.click(saveButton);

    await waitFor(() => {
      const toast = screen.queryByTestId("toast-message");
      expect(toast).not.toBeNull();
      expect(toast?.textContent).toContain("既存ログを確認中です");
    });

    expect(mockSaveDailyLog).not.toHaveBeenCalled();
    expect(mockSaveSleepSession).not.toHaveBeenCalled();
    expect(callOrder).toEqual([]);
  });

  /**
   * 既存日付で睡眠のみ変更:
   * 既に daily_logs 行があるため、saveDailyLog は呼ばず saveSleepSession のみ呼ぶ。
   */
  it("既存日付: 睡眠のみ変更のとき saveDailyLog は呼ばれず saveSleepSession のみ呼ばれる", async () => {
    mockDailyLogs = [{
      id: "daily-log-2026-04-10",
      log_date: "2026-04-10",
      weight: 70,
      calories: null,
      protein: null,
      fat: null,
      carbs: null,
      note: null,
      is_cheat_day: false,
      is_refeed_day: false,
      is_eating_out: false,
      is_travel_day: false,
      is_tanning_day: false,
      is_posing_day: false,
      sleep_hours: null,
      had_bowel_movement: null,
      training_type: null,
      work_mode: null,
      leg_flag: null,
      last_meal_end_time: null,
      step_count: null,
      created_at: null,
      updated_at: "2026-04-10T00:00:00.000Z",
      user_id: null,
    }];

    render(<MealLogger />);

    const bedTimeInput = screen.getByLabelText(/就寝時刻/);
    fireEvent.change(bedTimeInput, { target: { value: "22:30" } });

    const wakeTimeInput = screen.getByLabelText(/起床時刻/);
    fireEvent.change(wakeTimeInput, { target: { value: "06:30" } });

    const saveButton = screen.getByRole("button", { name: /保存/ });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockSaveSleepSession).toHaveBeenCalledTimes(1);
    });

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

  /**
   * daily_logs 変更あり + 睡眠が片側入力のとき、何も保存しない (#528 事前チェック回帰)。
   *
   * 修正前は saveDailyLog → 片側入力エラーの順序だったため、
   * daily_logs だけ保存されてからエラーが返る回帰が存在した。
   * 片側入力の妥当性チェックを saveDailyLog より前に移動することで
   * 両方未保存のまま早期 return されることを確認する。
   */
  it("daily_logs 変更あり + 睡眠が片側入力のとき saveDailyLog / saveSleepSession ともに呼ばれない", async () => {
    render(<MealLogger />);

    // 体重を入力（daily_logs の変更フラグを立てる）
    const weightInput = screen.getByLabelText(/体重/);
    fireEvent.change(weightInput, { target: { value: "70.5" } });

    // 就寝時刻のみ入力（起床時刻は空のまま = 片側入力）
    const bedTimeInput = screen.getByLabelText(/就寝時刻/);
    fireEvent.change(bedTimeInput, { target: { value: "23:00" } });
    // wakeTimeInput は変更しない

    const saveButton = screen.getByRole("button", { name: /保存/ });
    fireEvent.click(saveButton);

    // 片側入力エラーで早期 return → どちらも呼ばれない
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /保存中/ })).toBeNull();
    });

    expect(mockSaveDailyLog).not.toHaveBeenCalled();
    expect(mockSaveSleepSession).not.toHaveBeenCalled();
    expect(callOrder).toEqual([]);
  });

  /**
   * saveDailyLog 成功後に saveSleepSession が throw したとき (#544 回帰)。
   *
   * saveSleepSession が Server Action 境界で throw した場合でも、
   * MealLogger の inner try-catch が捕捉して generic error に落とさず、
   * 「日次ログは保存されたが睡眠は未保存」の partial save メッセージを表示する。
   * また保存順序 (saveDailyLog → saveSleepSession) が維持されることを確認する。
   */
  it("saveDailyLog 成功後に saveSleepSession が throw したとき、partial save メッセージが表示される", async () => {
    mockSaveSleepSession.mockImplementationOnce(async () => {
      callOrder.push("saveSleepSession");
      throw new Error("Network error");
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
      expect(mockSaveSleepSession).toHaveBeenCalledTimes(1);
    });

    // 保存順序: saveDailyLog → saveSleepSession (#528)
    expect(callOrder).toEqual(["saveDailyLog", "saveSleepSession"]);

    // inner try-catch が捕捉 → partial save メッセージが表示される
    await waitFor(() => {
      const toast = screen.queryByTestId("toast-message");
      expect(toast).not.toBeNull();
      expect(toast?.textContent).toContain("日次ログは保存されましたが");
    });
  });

  /**
   * saveDailyLog 成功後に saveSleepSession が { ok: false } を返したとき (#544 回帰)。
   *
   * saveSleepSession が { ok: false } で返った場合も、dailyLogSaved=true のとき
   * partial save メッセージを優先して表示する。
   */
  it("saveDailyLog 成功後に saveSleepSession が { ok: false } を返したとき、partial save メッセージが表示される", async () => {
    mockSaveSleepSession.mockImplementationOnce(async () => {
      callOrder.push("saveSleepSession");
      return { ok: false, message: "保存に失敗しました: network timeout" };
    });

    render(<MealLogger />);

    const weightInput = screen.getByLabelText(/体重/);
    fireEvent.change(weightInput, { target: { value: "68.5" } });

    const bedTimeInput = screen.getByLabelText(/就寝時刻/);
    fireEvent.change(bedTimeInput, { target: { value: "22:30" } });

    const wakeTimeInput = screen.getByLabelText(/起床時刻/);
    fireEvent.change(wakeTimeInput, { target: { value: "06:30" } });

    const saveButton = screen.getByRole("button", { name: /保存/ });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockSaveDailyLog).toHaveBeenCalledTimes(1);
      expect(mockSaveSleepSession).toHaveBeenCalledTimes(1);
    });

    expect(callOrder).toEqual(["saveDailyLog", "saveSleepSession"]);

    // partial save メッセージが表示される（sleepResult.message ではなく日次ログ保存済み文言）
    await waitFor(() => {
      const toast = screen.queryByTestId("toast-message");
      expect(toast).not.toBeNull();
      expect(toast?.textContent).toContain("日次ログは保存されましたが");
    });
  });
});
