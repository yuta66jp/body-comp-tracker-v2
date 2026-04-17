"use client";

/**
 * MonthlyCalendar — 月間ログカレンダー
 *
 * react-day-picker v9 の DayPicker をベースに、各日セルを DailyLog データで
 * カスタム描画する。
 *
 * レイアウト仕様:
 *   セル高さ: h-24（モバイル）/ sm:h-32（PC）固定。
 *
 *   情報の縦方向優先順位:
 *     1. 日付（補助・小・左上）
 *     2. 体重 + 前日差分（近接表示: 71.2kg (+0.3)）
 *     3. カロリー + 差分（近接表示: 1984k (+65)）
 *     3b. 就寝 / 起床時刻（sm 以上）
 *     3c. 睡眠 / 断食（sm 以上・同一行・text-[11px]）
 *     4. 特殊日タグ（優先順位順で最大 2 件 + "+n"。sm 以上）
 *     4m. トレーニング部位（モバイルのみ）
 *     5. コンディションタグ（sm 以上）
 *
 * モバイル詳細パネル (#594):
 *   日付セルをタップするとカレンダー直下にインラインパネルを表示。
 *   就寝・起床・睡眠・断食・特殊日・トレーニング・排便を確認できる。
 *   再タップで解除。月切替時にリセット。
 *
 * 土日祝:
 *   - 土曜: 日付テキスト text-sky-600 / セル bg-sky-50
 *   - 日曜・祝日: 日付テキスト text-rose-600 / セル bg-rose-50
 *   - 祝日判定: japanese-holidays パッケージを使用
 *   - 祝日名: 日付行の右端に text-[9px] で補助表示（省略あり）
 *
 * 開始曜日: 日曜始まり（weekStartsOn={0}）
 *
 * 差分計算: buildCalendarDayMap に委譲。
 * 直前ログ（欠損日跨ぎあり）との差分を表示する。
 */

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { DayPicker } from "react-day-picker";
import { ja } from "date-fns/locale";
import * as JapaneseHolidays from "japanese-holidays";
import type { DashboardDailyLog, SleepSession } from "@/lib/supabase/types";
import { buildCalendarDayMap, getMobileTrainingLabel, toDateKey, type CalendarDayData, type CalendarDayTagInfo } from "@/lib/utils/calendarUtils";
import type { DayProps } from "react-day-picker";
import { toJstDateStr } from "@/lib/utils/date";
import { extractJstHHMM } from "@/lib/utils/sleepSession";

// ── コンテキスト ──────────────────────────────────────────────────────────────

interface CalendarCtx {
  dayMap:      Map<string, CalendarDayData>;
  todayKey:    string;
  selectedKey: string | null;
  onSelectDay: (key: string) => void;
}

const CalendarContext = createContext<CalendarCtx>({
  dayMap:      new Map(),
  todayKey:    "",
  selectedKey: null,
  onSelectDay: () => {},
});

// ── セル高さ定数 ─────────────────────────────────────────────────────────────
const CELL_H = "h-24 sm:h-32";

// ── 特殊日タグ表示優先順位 ────────────────────────────────────────────────────
const DAY_TAG_DISPLAY_PRIORITY = [
  "is_cheat_day",
  "is_refeed_day",
  "is_eating_out",
  "is_travel_day",
  "is_tanning_day",
  "is_posing_day",
] as const;

const MAX_DAY_TAG_DISPLAY = 2;

function buildDayTagDisplay(dayTags: CalendarDayTagInfo[]): {
  displayTags: CalendarDayTagInfo[];
  moreCount: number;
} {
  const prioritized: CalendarDayTagInfo[] = [];
  const rest: CalendarDayTagInfo[] = [];
  for (const key of DAY_TAG_DISPLAY_PRIORITY) {
    const found = dayTags.find((t) => t.key === key);
    if (found) prioritized.push(found);
  }
  for (const t of dayTags) {
    if (!DAY_TAG_DISPLAY_PRIORITY.includes(t.key as typeof DAY_TAG_DISPLAY_PRIORITY[number])) {
      rest.push(t);
    }
  }
  const sorted = [...prioritized, ...rest];
  return {
    displayTags: sorted.slice(0, MAX_DAY_TAG_DISPLAY),
    moreCount:   Math.max(0, sorted.length - MAX_DAY_TAG_DISPLAY),
  };
}

// ── 曜日タイプ判定 ────────────────────────────────────────────────────────────

type WeekdayType = "weekday" | "saturday" | "sunday-holiday";

function getWeekdayType(date: Date): WeekdayType {
  const dow = date.getDay();
  if (dow === 6) return "saturday";
  if (dow === 0) return "sunday-holiday";
  if (JapaneseHolidays.isHoliday(date)) return "sunday-holiday";
  return "weekday";
}

const CELL_BG: Record<WeekdayType, string> = {
  weekday:          "bg-white hover:bg-slate-50/60 transition-colors dark:bg-slate-900 dark:hover:bg-slate-800/60",
  saturday:         "bg-sky-50 hover:bg-sky-100/60 transition-colors dark:bg-sky-900/20 dark:hover:bg-sky-900/40",
  "sunday-holiday": "bg-rose-50 hover:bg-rose-100/60 transition-colors dark:bg-rose-900/20 dark:hover:bg-rose-900/40",
};

const DATE_NUM_COLOR: Record<WeekdayType, string> = {
  weekday:          "text-slate-500",
  saturday:         "text-sky-600 font-semibold",
  "sunday-holiday": "text-rose-600 font-semibold",
};

// ── カスタム Day コンポーネント ─────────────────────────────────────────────

function CalendarDayCell({ day, modifiers }: DayProps) {
  const { dayMap, todayKey, selectedKey, onSelectDay } = useContext(CalendarContext);

  if (modifiers.outside) {
    return (
      <td className="border border-slate-50 bg-slate-50/30 relative dark:border-slate-800 dark:bg-slate-800/30">
        <div className={CELL_H} />
      </td>
    );
  }

  const dateKey     = toDateKey(day.date);
  const isToday     = dateKey === todayKey;
  const isSelected  = dateKey === selectedKey;
  const weekdayType = getWeekdayType(day.date);
  const data        = dayMap.get(dateKey);
  const dayNum      = day.date.getDate();
  const holidayName = JapaneseHolidays.isHoliday(day.date) || null;

  const tdCls =
    "border border-slate-100 dark:border-slate-700 relative max-sm:cursor-pointer " +
    CELL_BG[weekdayType] +
    (isToday
      ? " ring-2 ring-inset ring-blue-400"
      : isSelected
      ? " max-sm:ring-2 max-sm:ring-inset max-sm:ring-violet-400"
      : "");

  const dateNumCls = isToday
    ? "text-blue-600 font-bold"
    : DATE_NUM_COLOR[weekdayType];

  const innerCls = `${CELL_H} overflow-hidden flex flex-col p-1 sm:p-1.5`;

  const mobileTrainingLabel = data
    ? getMobileTrainingLabel(data.log.training_type)
    : null;

  const { displayTags, moreCount } = data?.dayTags.length
    ? buildDayTagDisplay(data.dayTags)
    : { displayTags: [], moreCount: 0 };

  return (
    <td className={tdCls} onClick={() => onSelectDay(dateKey)}>
      <div className={innerCls}>

        {/* ① 日付（左）+ 祝日名（右・補助） */}
        <div className="flex items-baseline justify-between gap-0.5 leading-none">
          <span className={`text-[10px] leading-none ${dateNumCls}`}>{dayNum}</span>
          {holidayName && (
            <span className="min-w-0 flex-1 truncate text-right text-[8px] leading-none text-rose-400 ml-0.5">
              {holidayName}
            </span>
          )}
        </div>

        {/* ② 体重 + 前日差分 */}
        <div className="mt-1 flex items-baseline gap-0.5 leading-none flex-wrap">
          {data?.log.weight != null ? (
            <>
              <span className="text-xs sm:text-sm font-bold text-slate-800 leading-none dark:text-slate-200">
                {data.log.weight.toFixed(1)}
              </span>
              <span className="text-[9px] text-slate-400 dark:text-slate-500">kg</span>
              {data?.weightDelta != null && (
                <span className={`text-[9px] font-medium leading-none ${
                  data.weightDelta > 0
                    ? "text-rose-500"
                    : data.weightDelta < 0
                    ? "text-blue-500"
                    : "text-slate-300"
                }`}>
                  ({data.weightDelta > 0 ? "+" : ""}{data.weightDelta.toFixed(1)})
                </span>
              )}
            </>
          ) : (
            <span className="text-[10px] leading-none text-slate-200 dark:text-slate-700">—</span>
          )}
        </div>

        {/* ③ カロリー + 差分 */}
        {data?.log.calories != null && (
          <div className="mt-0.5 flex items-baseline gap-0.5 leading-none flex-wrap">
            <span className="text-[10px] sm:text-xs font-medium text-slate-600 dark:text-slate-300">
              {data.log.calories.toLocaleString()}
            </span>
            <span className="text-[8px] sm:text-[9px] text-slate-400 dark:text-slate-500">k</span>
            {data?.calDelta != null && (
              <span className={`text-[9px] sm:text-[10px] font-medium leading-none ${
                data.calDelta > 0
                  ? "text-blue-400"
                  : data.calDelta < 0
                  ? "text-rose-400"
                  : "text-slate-300"
              }`}>
                ({data.calDelta > 0 ? "+" : ""}{data.calDelta})
              </span>
            )}
          </div>
        )}

        {/* ③-b 就寝 / 起床時刻（デスクトップのみ）*/}
        {(data?.bed_at != null || data?.wake_at != null) && (() => {
          const bedHHMM  = data?.bed_at  ? extractJstHHMM(data.bed_at)  : null;
          const wakeHHMM = data?.wake_at ? extractJstHHMM(data.wake_at) : null;
          if (!bedHHMM && !wakeHHMM) return null;
          return (
            <div className="mt-0.5 hidden sm:flex items-baseline gap-1.5 leading-none flex-wrap">
              {bedHHMM && (
                <span className="inline-flex items-baseline gap-0.5">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">就寝</span>
                  <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">{bedHHMM}</span>
                </span>
              )}
              {wakeHHMM && (
                <span className="inline-flex items-baseline gap-0.5">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">起床</span>
                  <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">{wakeHHMM}</span>
                </span>
              )}
            </div>
          );
        })()}

        {/* ③-c 睡眠 / 断食（デスクトップのみ）*/}
        {(data?.sleep_hours != null || data?.fasting_hours != null) && (
          <div className="mt-0.5 hidden sm:flex items-baseline gap-1.5 leading-none flex-wrap">
            {data?.sleep_hours != null && (
              <span className="inline-flex items-baseline gap-0.5">
                <span className="text-[11px] text-slate-500 dark:text-slate-400">睡眠</span>
                <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                  {data.sleep_hours % 1 === 0 ? data.sleep_hours.toFixed(0) : data.sleep_hours.toFixed(1)}
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">h</span>
              </span>
            )}
            {data?.fasting_hours != null && (
              <span className="inline-flex items-baseline gap-0.5">
                <span className="text-[11px] text-slate-500 dark:text-slate-400">断食</span>
                <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                  {data.fasting_hours % 1 === 0 ? data.fasting_hours.toFixed(0) : data.fasting_hours.toFixed(1)}
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">h</span>
              </span>
            )}
          </div>
        )}

        {/* ④ 特殊日タグ（デスクトップのみ・最大 2 件 + "+n"）*/}
        {displayTags.length > 0 && (
          <div className="mt-0.5 hidden sm:flex flex-wrap gap-0.5 items-center">
            {displayTags.map((tag) => (
              <span
                key={tag.key}
                className={`rounded-full px-1.5 py-0.5 text-[9px] sm:text-[10px] font-semibold leading-none ${tag.colorClass}`}
              >
                {tag.label}
              </span>
            ))}
            {moreCount > 0 && (
              <span className="text-[9px] font-medium text-slate-400 dark:text-slate-500">
                +{moreCount}
              </span>
            )}
          </div>
        )}

        {/* ④-mobile トレーニング部位（モバイルのみ）*/}
        {mobileTrainingLabel && (
          <div className="mt-0.5 sm:hidden">
            <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold leading-none ${mobileTrainingLabel.colorClass}`}>
              {mobileTrainingLabel.label}
            </span>
          </div>
        )}

        {/* ⑤ コンディションタグ（sm 以上）*/}
        {data?.conditionTags && data.conditionTags.length > 0 && (
          <div className="mt-0.5 hidden flex-wrap gap-0.5 sm:flex">
            {data.conditionTags.map((tag) => (
              <span
                key={tag.key}
                className={`rounded-full px-1.5 py-0.5 text-xs font-semibold leading-none ${tag.colorClass}`}
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

// ── モバイル詳細パネル ────────────────────────────────────────────────────────

const DOW_JA = ["日", "月", "火", "水", "木", "金", "土"] as const;

/** ラベル + 値の1行。value が null/undefined の場合は "—" を表示する。 */
function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="w-8 shrink-0 text-[11px] text-slate-400 dark:text-slate-500">{label}</span>
      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{value ?? "—"}</span>
    </div>
  );
}

/**
 * モバイル専用の選択日詳細パネル。
 * 就寝・起床・睡眠・断食・特殊日・トレーニング・排便を表示する。
 * sm 以上では hidden（PC は各セル内に情報が表示される）。
 */
function MobileDayDetailPanel({
  dateKey,
  data,
  onClose,
}: {
  dateKey: string;
  data: CalendarDayData | undefined;
  onClose: () => void;
}) {
  const [y, mo, d] = dateKey.split("-").map(Number) as [number, number, number];
  const dateObj    = new Date(y, mo - 1, d);
  const dow        = DOW_JA[dateObj.getDay()];
  const dateLabel  = `${mo}月${d}日（${dow}）`;
  const holidayName = JapaneseHolidays.isHoliday(dateObj) || null;

  const bedHHMM  = data?.bed_at  ? extractJstHHMM(data.bed_at)  : null;
  const wakeHHMM = data?.wake_at ? extractJstHHMM(data.wake_at) : null;

  const hasSleepData = bedHHMM != null || wakeHHMM != null ||
    data?.sleep_hours != null || data?.fasting_hours != null;

  const trainingTag = data?.conditionTags.find((t) => t.key === "training");
  const bowelTag    = data?.conditionTags.find((t) => t.key === "bowel");
  const hasConditionData = !!(
    (data?.dayTags.length ?? 0) > 0 || trainingTag || bowelTag
  );

  return (
    <div className="sm:hidden mt-2 rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 overflow-hidden">

      {/* ヘッダー */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 dark:border-slate-700">
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{dateLabel}</span>
        {holidayName && (
          <span className="text-xs text-rose-400">{holidayName}</span>
        )}
        <button
          onClick={onClose}
          className="ml-auto text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-base leading-none"
          aria-label="閉じる"
        >
          ✕
        </button>
      </div>

      {/* ログなし */}
      {!data ? (
        <p className="px-3 py-3 text-sm text-slate-400 dark:text-slate-500">この日の記録はありません</p>
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-slate-700">

          {/* 睡眠・時刻セクション */}
          {hasSleepData && (
            <div className="px-3 py-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5">
              <DetailRow label="就寝" value={bedHHMM} />
              <DetailRow label="起床" value={wakeHHMM} />
              <DetailRow
                label="睡眠"
                value={data.sleep_hours != null
                  ? `${data.sleep_hours % 1 === 0 ? data.sleep_hours.toFixed(0) : data.sleep_hours.toFixed(1)}h`
                  : null}
              />
              <DetailRow
                label="断食"
                value={data.fasting_hours != null
                  ? `${data.fasting_hours % 1 === 0 ? data.fasting_hours.toFixed(0) : data.fasting_hours.toFixed(1)}h`
                  : null}
              />
            </div>
          )}

          {/* 生活・コンディションセクション */}
          {hasConditionData && (
            <div className="px-3 py-2.5 space-y-1.5">

              {/* 特殊日タグ（全件） */}
              {data.dayTags.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="shrink-0 text-[11px] text-slate-400 dark:text-slate-500">特殊日</span>
                  {data.dayTags.map((tag) => (
                    <span
                      key={tag.key}
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold leading-none ${tag.colorClass}`}
                    >
                      {tag.label}
                    </span>
                  ))}
                </div>
              )}

              {/* トレーニング */}
              {trainingTag && (
                <div className="flex items-center gap-1.5">
                  <span className="shrink-0 text-[11px] text-slate-400 dark:text-slate-500">トレーニング</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold leading-none ${trainingTag.colorClass}`}>
                    {trainingTag.label}
                  </span>
                </div>
              )}

              {/* 排便 */}
              {bowelTag && (
                <div className="flex items-center gap-1.5">
                  <span className="shrink-0 text-[11px] text-slate-400 dark:text-slate-500">排便</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold leading-none ${bowelTag.colorClass}`}>
                    {bowelTag.label}
                  </span>
                </div>
              )}

            </div>
          )}

          {/* ログあり・表示データなし */}
          {!hasSleepData && !hasConditionData && (
            <p className="px-3 py-3 text-sm text-slate-400 dark:text-slate-500">詳細データはありません</p>
          )}

        </div>
      )}
    </div>
  );
}

// ── メインコンポーネント ──────────────────────────────────────────────────────

interface MonthlyCalendarProps {
  logs: DashboardDailyLog[];
  sleepSessions?: Pick<SleepSession, "wake_date" | "wake_at" | "bed_at">[];
}

export function MonthlyCalendar({ logs, sleepSessions = [] }: MonthlyCalendarProps) {
  const todayKey = toJstDateStr();
  const [y, m]   = todayKey.split("-").map(Number) as [number, number, number];

  const [month,       setMonth]       = useState<Date>(new Date(y, m - 1, 1));
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const dayMap = useMemo(() => buildCalendarDayMap(logs, sleepSessions), [logs, sleepSessions]);

  // 再タップで解除するトグル。sm 以上（デスクトップ）では詳細パネルが非表示のため state 変更しない
  const handleSelectDay = useCallback((key: string) => {
    if (window.matchMedia("(max-width: 639px)").matches) {
      setSelectedKey((prev) => prev === key ? null : key);
    }
  }, []);

  // 月切替時に選択状態をリセット
  const handleMonthChange = useCallback((newMonth: Date) => {
    setMonth(newMonth);
    setSelectedKey(null);
  }, []);

  const ctxValue: CalendarCtx = useMemo(
    () => ({ dayMap, todayKey, selectedKey, onSelectDay: handleSelectDay }),
    [dayMap, todayKey, selectedKey, handleSelectDay]
  );

  return (
    <CalendarContext.Provider value={ctxValue}>
      <DayPicker
        month={month}
        onMonthChange={handleMonthChange}
        locale={ja}
        weekStartsOn={0}
        showOutsideDays
        components={{ Day: CalendarDayCell }}
        classNames={{
          root:          "w-full",
          months:        "w-full",
          month:         "w-full",
          month_caption: "flex items-center justify-between mb-3 px-1",
          caption_label: "text-sm font-semibold text-slate-700 dark:text-slate-300",
          nav:           "flex items-center gap-1",
          button_previous:
            "flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-400 " +
            "hover:border-slate-300 hover:text-slate-600 transition-colors " +
            "dark:border-slate-600 dark:text-slate-500 dark:hover:border-slate-500 dark:hover:text-slate-300",
          button_next:
            "flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-400 " +
            "hover:border-slate-300 hover:text-slate-600 transition-colors " +
            "dark:border-slate-600 dark:text-slate-500 dark:hover:border-slate-500 dark:hover:text-slate-300",
          chevron:       "h-3.5 w-3.5",
          month_grid:    "w-full border-collapse table-fixed",
          weekdays:      "",
          weekday:       "py-2 text-[11px] font-semibold text-slate-400 text-center dark:text-slate-500",
          weeks:         "",
          week:          "",
          day:           "",
          day_button:    "hidden",
        }}
      />

      {/* モバイル詳細パネル: 選択日がある場合のみ表示 */}
      {selectedKey && (
        <MobileDayDetailPanel
          dateKey={selectedKey}
          data={dayMap.get(selectedKey)}
          onClose={() => setSelectedKey(null)}
        />
      )}
    </CalendarContext.Provider>
  );
}
