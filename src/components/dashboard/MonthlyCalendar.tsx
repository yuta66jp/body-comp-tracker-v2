"use client";

/**
 * MonthlyCalendar — 月間ログカレンダー
 *
 * react-day-picker v9 の DayPicker をベースに、各日セルを DailyLog データで
 * カスタム描画する。
 *
 * 表示仕様:
 *   - デフォルト表示: 当月（JST 基準）
 *   - 前月 / 翌月切替: DayPicker 組み込みナビゲーション
 *   - ログあり日セル:
 *       - 日付番号（左上）+ 体重 / 体重差分（右上）
 *       - カロリー / カロリー差分（中段）
 *       - 特殊日タグ（下段）
 *       - コンディション要約（最下段・モバイルでは省略）
 *   - ログなし日セル: 日付番号のみ（淡色）
 *   - 今月以外の日（outside day）: 表示しない
 *
 * 差分計算: buildCalendarDayMap に委譲。
 * 直前ログ（欠損日跨ぎあり）との差分を表示する。
 */

import { createContext, useContext, useMemo, useState } from "react";
import { DayPicker } from "react-day-picker";
import { ja } from "date-fns/locale";
import type { DailyLog } from "@/lib/supabase/types";
import { buildCalendarDayMap, toDateKey, type CalendarDayData } from "@/lib/utils/calendarUtils";
import type { DayProps } from "react-day-picker";
import { toJstDateStr } from "@/lib/utils/date";

// ── コンテキスト ──────────────────────────────────────────────────────────────

interface CalendarCtx {
  dayMap: Map<string, CalendarDayData>;
  todayKey: string;
}

const CalendarContext = createContext<CalendarCtx>({
  dayMap:   new Map(),
  todayKey: "",
});

// ── カスタム Day コンポーネント ─────────────────────────────────────────────

function CalendarDayCell({ day, modifiers }: DayProps) {
  const { dayMap, todayKey } = useContext(CalendarContext);

  // outside: 表示月以外の日（非表示）
  if (modifiers.outside) {
    return <td className="border border-slate-50 bg-slate-50/30 p-0" />;
  }

  const dateKey = toDateKey(day.date);
  const isToday = dateKey === todayKey;
  const data    = dayMap.get(dateKey);
  const dayNum  = day.date.getDate();

  const cellBase =
    "border border-slate-100 align-top p-1 min-h-[72px] sm:min-h-[84px] " +
    (isToday ? "bg-blue-50/60" : "bg-white hover:bg-slate-50/70 transition-colors");

  if (!data) {
    // ログなし
    return (
      <td className={cellBase}>
        <span className={`text-[11px] font-medium ${isToday ? "text-blue-500" : "text-slate-300"}`}>
          {dayNum}
        </span>
      </td>
    );
  }

  const { log, weightDelta, calDelta, dayTags, conditionSummary } = data;

  return (
    <td className={cellBase}>
      {/* 1行目: 日付 + 体重 */}
      <div className="flex items-start justify-between gap-0.5">
        <span className={`text-[11px] font-semibold ${isToday ? "text-blue-600" : "text-slate-500"}`}>
          {dayNum}
        </span>

        {log.weight !== null && (
          <div className="text-right leading-none">
            <span className="text-[11px] font-semibold text-slate-700">
              {log.weight.toFixed(1)}
            </span>
            <span className="ml-0.5 text-[9px] text-slate-400">kg</span>
            {weightDelta !== null && (
              <div className={`text-[9px] font-medium leading-none mt-0.5 ${
                weightDelta > 0
                  ? "text-rose-500"
                  : weightDelta < 0
                  ? "text-blue-500"
                  : "text-slate-300"
              }`}>
                {weightDelta > 0 ? "+" : ""}{weightDelta.toFixed(1)}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 2行目: カロリー */}
      {log.calories !== null && (
        <div className="mt-0.5 flex items-baseline gap-0.5 leading-none">
          <span className="text-[9px] text-slate-500">
            {log.calories.toLocaleString()}
          </span>
          <span className="text-[8px] text-slate-400">kcal</span>
          {calDelta !== null && (
            <span className={`text-[8px] font-medium ${
              calDelta > 0
                ? "text-blue-400"
                : calDelta < 0
                ? "text-rose-400"
                : "text-slate-300"
            }`}>
              ({calDelta > 0 ? "+" : ""}{calDelta})
            </span>
          )}
        </div>
      )}

      {/* 3行目: 特殊日タグ */}
      {dayTags.length > 0 && (
        <div className="mt-0.5 flex flex-wrap gap-0.5">
          {dayTags.map((tag) => (
            <span
              key={tag.key}
              className={`rounded-full px-1 py-0 text-[8px] font-semibold leading-4 ${tag.colorClass}`}
            >
              {tag.label}
            </span>
          ))}
        </div>
      )}

      {/* 4行目: コンディション（モバイルでは hidden → sm 以上で表示） */}
      {conditionSummary && (
        <div className="mt-0.5 hidden text-[8px] leading-snug text-slate-400 sm:block">
          {conditionSummary}
        </div>
      )}
    </td>
  );
}

// ── メインコンポーネント ──────────────────────────────────────────────────────

interface MonthlyCalendarProps {
  logs: DailyLog[];
}

export function MonthlyCalendar({ logs }: MonthlyCalendarProps) {
  // 当月（JST 基準）でデフォルト初期化
  const todayKey   = toJstDateStr();
  const [y, m]     = todayKey.split("-").map(Number);
  const [month, setMonth] = useState<Date>(new Date(y, m - 1, 1));

  const dayMap = useMemo(() => buildCalendarDayMap(logs), [logs]);

  const ctxValue: CalendarCtx = useMemo(
    () => ({ dayMap, todayKey }),
    [dayMap, todayKey]
  );

  return (
    <CalendarContext.Provider value={ctxValue}>
      <DayPicker
        month={month}
        onMonthChange={setMonth}
        locale={ja}
        weekStartsOn={1}
        showOutsideDays
        components={{ Day: CalendarDayCell }}
        classNames={{
          root:             "w-full",
          months:           "w-full",
          month:            "w-full",
          month_caption:    "flex items-center justify-between mb-3 px-1",
          caption_label:    "text-sm font-semibold text-slate-700",
          nav:              "flex items-center gap-1",
          button_previous:
            "flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-400 " +
            "hover:border-slate-300 hover:text-slate-600 transition-colors",
          button_next:
            "flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-400 " +
            "hover:border-slate-300 hover:text-slate-600 transition-colors",
          chevron:          "h-3.5 w-3.5",
          month_grid:       "w-full border-collapse",
          weekdays:         "",
          weekday:          "py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400 text-center",
          weeks:            "",
          week:             "",
          // Day は CalendarDayCell が直接 <td> を返すのでクラス指定不要
          day:              "",
          day_button:       "hidden", // DayButton は使わない（CalendarDayCell が全描画）
        }}
      />
    </CalendarContext.Provider>
  );
}
