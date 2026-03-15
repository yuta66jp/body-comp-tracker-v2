"use client";

/**
 * MonthlyCalendar — 月間ログカレンダー
 *
 * react-day-picker v9 の DayPicker をベースに、各日セルを DailyLog データで
 * カスタム描画する。
 *
 * レイアウト仕様:
 *   セル高さ: h-24（モバイル）/ h-28（PC）固定。ログ有無でサイズが変わらない。
 *   td 内の absolute div + overflow-hidden でコンテンツを固定高に収める。
 *
 *   情報の縦方向優先順位:
 *     1. 日付（補助・小・左上）
 *     2. 体重（主・太字）
 *     3. 体重前日差分（色付き）
 *     4. 摂取カロリー（値）
 *     5. カロリー差分（補助・別行）
 *     6. 特殊日タグ
 *     7. コンディションタグ（sm 以上）
 *
 * 土日祝:
 *   - 土曜: 日付テキスト text-sky-600 / セル bg-sky-50/40
 *   - 日曜・祝日: 日付テキスト text-rose-500 / セル bg-rose-50/40
 *   - 祝日判定: japanese-holidays パッケージを使用
 *
 * 差分計算: buildCalendarDayMap に委譲。
 * 直前ログ（欠損日跨ぎあり）との差分を表示する。
 */

import { createContext, useContext, useMemo, useState } from "react";
import { DayPicker } from "react-day-picker";
import { ja } from "date-fns/locale";
import * as JapaneseHolidays from "japanese-holidays";
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

// ── セル高さ定数 ─────────────────────────────────────────────────────────────
// h-24 = 96px (モバイル)、h-28 = 112px (PC)
const CELL_H = "h-24 sm:h-28";

// ── 曜日タイプ判定 ────────────────────────────────────────────────────────────

type WeekdayType = "weekday" | "saturday" | "sunday-holiday";

function getWeekdayType(date: Date): WeekdayType {
  const dow = date.getDay(); // 0=日, 6=土
  if (dow === 6) return "saturday";
  if (dow === 0) return "sunday-holiday";
  // 祝日判定（japanese-holidays）
  if (JapaneseHolidays.isHoliday(date)) return "sunday-holiday";
  return "weekday";
}

/** 曜日タイプ → セル背景クラス（today 以外） */
const CELL_BG: Record<WeekdayType, string> = {
  weekday:         "bg-white hover:bg-slate-50/70 transition-colors",
  saturday:        "bg-sky-50/40 hover:bg-sky-50/70 transition-colors",
  "sunday-holiday":"bg-rose-50/40 hover:bg-rose-50/60 transition-colors",
};

/** 曜日タイプ → 日付テキスト色（today 以外） */
const DATE_NUM_COLOR: Record<WeekdayType, string> = {
  weekday:          "text-slate-400",
  saturday:         "text-sky-600",
  "sunday-holiday": "text-rose-500",
};

// ── カスタム Day コンポーネント ─────────────────────────────────────────────

function CalendarDayCell({ day, modifiers }: DayProps) {
  const { dayMap, todayKey } = useContext(CalendarContext);

  // outside: 表示月以外の日（同じ固定高で空セル）
  if (modifiers.outside) {
    return (
      <td className={`${CELL_H} border border-slate-50 bg-slate-50/30 relative`} />
    );
  }

  const dateKey     = toDateKey(day.date);
  const isToday     = dateKey === todayKey;
  const weekdayType = getWeekdayType(day.date);
  const data        = dayMap.get(dateKey);
  const dayNum      = day.date.getDate();

  const tdCls =
    `${CELL_H} border border-slate-100 relative ` +
    (isToday ? "bg-blue-50/60" : CELL_BG[weekdayType]);

  const dateNumCls = isToday
    ? "text-blue-500 font-semibold"
    : DATE_NUM_COLOR[weekdayType];

  // absolute + overflow-hidden で固定高を保証
  const innerCls =
    `absolute inset-0 ${CELL_H} overflow-hidden flex flex-col p-1 sm:p-1.5`;

  return (
    <td className={tdCls}>
      <div className={innerCls}>

        {/* ① 日付（補助・左上） */}
        <div className={`text-[10px] font-medium leading-none ${dateNumCls}`}>
          {dayNum}
        </div>

        {/* ② 体重（主情報） */}
        <div className="mt-1 flex items-baseline gap-0.5 leading-none">
          {data?.log.weight != null ? (
            <>
              <span className="text-xs sm:text-sm font-bold text-slate-800 leading-none">
                {data.log.weight.toFixed(1)}
              </span>
              <span className="text-[9px] text-slate-400">kg</span>
            </>
          ) : (
            <span className="text-[10px] leading-none text-slate-200">—</span>
          )}
        </div>

        {/* ③ 体重前日差分 */}
        {data?.weightDelta != null && (
          <div className={`mt-0.5 text-[10px] font-medium leading-none ${
            data.weightDelta > 0
              ? "text-rose-500"
              : data.weightDelta < 0
              ? "text-blue-500"
              : "text-slate-300"
          }`}>
            {data.weightDelta > 0 ? "+" : ""}{data.weightDelta.toFixed(1)}
          </div>
        )}

        {/* ④ 摂取カロリー */}
        {data?.log.calories != null && (
          <div className="mt-0.5 flex items-baseline gap-0.5 leading-none">
            <span className="text-[10px] font-medium text-slate-600">
              {data.log.calories.toLocaleString()}
            </span>
            <span className="text-[8px] text-slate-400">k</span>
          </div>
        )}

        {/* ⑤ カロリー差分（補助・別行） */}
        {data?.calDelta != null && (
          <div className={`text-[9px] font-medium leading-none ${
            data.calDelta > 0
              ? "text-blue-400"
              : data.calDelta < 0
              ? "text-rose-400"
              : "text-slate-300"
          }`}>
            {data.calDelta > 0 ? "+" : ""}{data.calDelta}
          </div>
        )}

        {/* ⑥ 特殊日タグ */}
        {data?.dayTags && data.dayTags.length > 0 && (
          <div className="mt-0.5 flex flex-wrap gap-0.5">
            {data.dayTags.map((tag) => (
              <span
                key={tag.key}
                className={`rounded-full px-1 py-0 text-[8px] font-semibold leading-4 ${tag.colorClass}`}
              >
                {tag.label}
              </span>
            ))}
          </div>
        )}

        {/* ⑦ コンディションタグ（sm 以上） */}
        {data?.conditionTags && data.conditionTags.length > 0 && (
          <div className="mt-0.5 hidden flex-wrap gap-0.5 sm:flex">
            {data.conditionTags.map((tag) => (
              <span
                key={tag.key}
                className={`rounded-full px-1 py-0 text-[8px] font-semibold leading-4 ${tag.colorClass}`}
              >
                {tag.label}
              </span>
            ))}
          </div>
        )}

      </div>
    </td>
  );
}

// ── メインコンポーネント ──────────────────────────────────────────────────────

interface MonthlyCalendarProps {
  logs: DailyLog[];
}

export function MonthlyCalendar({ logs }: MonthlyCalendarProps) {
  // 当月（JST 基準）でデフォルト初期化
  const todayKey          = toJstDateStr();
  const [y, m]            = todayKey.split("-").map(Number);
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
          root:          "w-full",
          months:        "w-full",
          month:         "w-full",
          month_caption: "flex items-center justify-between mb-3 px-1",
          caption_label: "text-sm font-semibold text-slate-700",
          nav:           "flex items-center gap-1",
          button_previous:
            "flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-400 " +
            "hover:border-slate-300 hover:text-slate-600 transition-colors",
          button_next:
            "flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-400 " +
            "hover:border-slate-300 hover:text-slate-600 transition-colors",
          chevron:       "h-3.5 w-3.5",
          month_grid:    "w-full border-collapse",
          weekdays:      "",
          weekday:       "py-2 text-[11px] font-semibold text-slate-400 text-center",
          weeks:         "",
          week:          "",
          day:           "",
          day_button:    "hidden",
        }}
      />
    </CalendarContext.Provider>
  );
}
