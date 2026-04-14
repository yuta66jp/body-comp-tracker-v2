/**
 * calcMonthlySleepStats — 月別睡眠リズム集計
 *
 * sleep_sessions を source of truth として月別の睡眠集計を計算する純粋関数。
 *
 * ## 集計仕様
 *   - 睡眠時間  : wake_date 基準で月内の全セッションの平均 (小数点以下1桁)
 *   - 就寝・起床: 同月の中央値 ("HH:MM" JST)
 *   - 勤務形態別: work_mode が記録されているセッションのみを対象に平均を計算
 *
 * ## 就寝時刻の中央値における日跨ぎ補正
 *   就寝時刻は 22:00-02:00 程度に分布し、深夜0時を跨ぐ。
 *   0:00-11:59 は +24h してオフセットし「前日夜の続き」として扱うことで
 *   単純な数値ソートで正しい中央値を算出できる。
 *
 * ## 注意
 *   - sleep_sessions がないセッションは全集計から除外される
 *   - 勤務形態未記録日 (work_mode === null) は勤務形態別集計から除外される
 *   - その他の work_mode 値 (active / travel / other 等) も勤務形態別集計から除外される
 */

import { extractJstHHMM } from "./sleepSession";
import { deriveSleepHours } from "./sleep";

/** 中央値就寝時刻の補正のために「昼」とみなす閾値 (分単位: 12:00 = 720) */
const NOON_MINUTES = 12 * 60;
const DAY_MINUTES  = 24 * 60;

export interface MonthlySleepStats {
  /** 全体平均睡眠時間 (h, 小数点以下1桁)。セッションなしなら null */
  avgSleepHours: number | null;
  /** 勤務形態別平均睡眠時間。対象セッションなしの形態は null */
  avgByWorkMode: {
    /** 出社 (office) 日の平均睡眠時間 */
    office: number | null;
    /** 在宅 (remote) 日の平均睡眠時間 */
    remote: number | null;
    /** 休日 (off) 日の平均睡眠時間 */
    off: number | null;
  };
  /** 就寝時刻の中央値 "HH:MM" JST。算出不能なら null */
  medianBedTime: string | null;
  /** 起床時刻の中央値 "HH:MM" JST。算出不能なら null */
  medianWakeTime: string | null;
}

/** "HH:MM" → 分数に変換。就寝時刻用: 0:00-11:59 は +24h してオフセット */
export function bedTimeToMinutes(hhmm: string): number | null {
  const parts = hhmm.split(":");
  if (parts.length !== 2) return null;
  const h = parseInt(parts[0] ?? "", 10);
  const m = parseInt(parts[1] ?? "", 10);
  if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
  const mins = h * 60 + m;
  return mins < NOON_MINUTES ? mins + DAY_MINUTES : mins;
}

/** "HH:MM" → 分数に変換。起床時刻用 (日跨ぎなし) */
export function wakeTimeToMinutes(hhmm: string): number | null {
  const parts = hhmm.split(":");
  if (parts.length !== 2) return null;
  const h = parseInt(parts[0] ?? "", 10);
  const m = parseInt(parts[1] ?? "", 10);
  if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

/** 分数 → "HH:MM" に変換 (24h 超は mod 処理) */
export function minutesToHHMM(totalMinutes: number): string {
  const rounded = Math.round(totalMinutes);
  const normalized = ((rounded % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * 数値配列の中央値を返す。
 * 偶数個の場合は中央2値の平均。空配列の場合は null。
 */
export function medianOf(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

type SleepSessionInput = {
  wake_date: string;
  bed_at: string;   // TIMESTAMPTZ
  wake_at: string;  // TIMESTAMPTZ
};

/**
 * 1ヶ月分の睡眠セッションと勤務形態マップから睡眠集計を計算する。
 *
 * @param sessions       対象月の sleep_sessions
 * @param workModeByDate wake_date → work_mode のマップ (daily_logs から構築)
 */
export function calcMonthlySleepStats(
  sessions: SleepSessionInput[],
  workModeByDate: Map<string, string | null>,
): MonthlySleepStats {
  type SleepEntry = {
    sleepHours: number;
    bedTime: string;
    wakeTime: string;
    workMode: string | null;
  };

  const entries: SleepEntry[] = [];

  for (const s of sessions) {
    const bedTime  = extractJstHHMM(s.bed_at);
    const wakeTime = extractJstHHMM(s.wake_at);
    if (!bedTime || !wakeTime) continue;

    const sleepHours = deriveSleepHours(bedTime, wakeTime);
    if (sleepHours === null) continue;

    entries.push({
      sleepHours,
      bedTime,
      wakeTime,
      workMode: workModeByDate.get(s.wake_date) ?? null,
    });
  }

  if (entries.length === 0) {
    return {
      avgSleepHours: null,
      avgByWorkMode: { office: null, remote: null, off: null },
      medianBedTime:  null,
      medianWakeTime: null,
    };
  }

  // 全体平均睡眠時間
  const sumHours = entries.reduce((acc, e) => acc + e.sleepHours, 0);
  const avgSleepHours = Math.round((sumHours / entries.length) * 10) / 10;

  // 勤務形態別平均睡眠時間 (office / remote / off のみ)
  const groups: Record<"office" | "remote" | "off", number[]> = {
    office: [],
    remote: [],
    off:    [],
  };
  for (const e of entries) {
    if (e.workMode === "office") groups.office.push(e.sleepHours);
    else if (e.workMode === "remote") groups.remote.push(e.sleepHours);
    else if (e.workMode === "off")    groups.off.push(e.sleepHours);
    // null / その他は除外
  }
  const avgOf = (arr: number[]): number | null => {
    if (arr.length === 0) return null;
    return Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10;
  };
  const avgByWorkMode = {
    office: avgOf(groups.office),
    remote: avgOf(groups.remote),
    off:    avgOf(groups.off),
  };

  // 就寝時刻の中央値 (日跨ぎ補正あり)
  const bedMins = entries
    .map((e) => bedTimeToMinutes(e.bedTime))
    .filter((v): v is number => v !== null);
  const medBed = medianOf(bedMins);
  const medianBedTime = medBed !== null ? minutesToHHMM(medBed) : null;

  // 起床時刻の中央値
  const wakeMins = entries
    .map((e) => wakeTimeToMinutes(e.wakeTime))
    .filter((v): v is number => v !== null);
  const medWake = medianOf(wakeMins);
  const medianWakeTime = medWake !== null ? minutesToHHMM(medWake) : null;

  return { avgSleepHours, avgByWorkMode, medianBedTime, medianWakeTime };
}

/**
 * MonthlySleepStats から1行目の表示文字列を組み立てる。
 *
 * 例: "睡眠 6.8h（出6.1 / 在7.0 / 休7.8）"
 * 値がある形態のみ括弧内に含める。
 * 勤務形態別が全て null なら括弧部分を省略する。
 */
export function formatSleepLine1(stats: MonthlySleepStats): string | null {
  if (stats.avgSleepHours === null) return null;
  const main = `睡眠 ${stats.avgSleepHours.toFixed(1)}h`;

  const parts: string[] = [];
  const { office, remote, off } = stats.avgByWorkMode;
  if (office !== null) parts.push(`出${office.toFixed(1)}`);
  if (remote !== null) parts.push(`在${remote.toFixed(1)}`);
  if (off    !== null) parts.push(`休${off.toFixed(1)}`);

  if (parts.length === 0) return main;
  return `${main}（${parts.join(" / ")}）`;
}

/**
 * MonthlySleepStats から2行目の表示文字列を組み立てる。
 *
 * 例: "就 00:34 / 起 07:18"
 * 一方しかない場合は該当する方のみ表示する。
 * 両方 null なら null を返す。
 */
export function formatSleepLine2(stats: MonthlySleepStats): string | null {
  const parts: string[] = [];
  if (stats.medianBedTime  !== null) parts.push(`就 ${stats.medianBedTime}`);
  if (stats.medianWakeTime !== null) parts.push(`起 ${stats.medianWakeTime}`);
  return parts.length > 0 ? parts.join(" / ") : null;
}
