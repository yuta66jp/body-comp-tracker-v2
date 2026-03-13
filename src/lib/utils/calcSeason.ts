import type { CareerLog } from "@/lib/supabase/types";
import { parseLocalDateStr } from "./date";

export interface SeasonMeta {
  season: string;
  targetDate: string;
  startDate: string;
  endDate: string;
  peakWeight: number;   // 仕上がり体重 = シーズン最小体重
  peakDate: string;     // 最小体重の日付
  count: number;
}

export interface DaysOutPoint {
  daysOut: number;      // 0 = 大会日, 負の値 = 大会前
  weight: number;
  sma7: number | null;  // 7日移動平均
  season: string;
}

/** シーズン別メタ情報を集計する */
export function calcSeasonMeta(logs: CareerLog[]): SeasonMeta[] {
  const map = new Map<string, CareerLog[]>();
  for (const log of logs) {
    if (!map.has(log.season)) map.set(log.season, []);
    map.get(log.season)!.push(log);
  }

  return Array.from(map.entries())
    .map(([season, entries]) => {
      const sorted = [...entries].sort((a, b) => a.log_date.localeCompare(b.log_date));
      const weights = sorted.map((e) => e.weight);
      const minWeight = Math.min(...weights);
      const minIdx = weights.indexOf(minWeight);

      return {
        season,
        targetDate: sorted[0].target_date,
        startDate: sorted[0].log_date,
        endDate: sorted[sorted.length - 1].log_date,
        peakWeight: minWeight,
        peakDate: sorted[minIdx].log_date,
        count: sorted.length,
      };
    })
    .sort((a, b) => a.season.localeCompare(b.season));
}

/** days_out 軸のデータを構築する (X軸: 大会日からの日数) */
export function buildDaysOutSeries(
  logs: CareerLog[],
  seasonFilter?: string[]
): Map<string, DaysOutPoint[]> {
  const map = new Map<string, CareerLog[]>();
  for (const log of logs) {
    if (seasonFilter && !seasonFilter.includes(log.season)) continue;
    if (!map.has(log.season)) map.set(log.season, []);
    map.get(log.season)!.push(log);
  }

  const result = new Map<string, DaysOutPoint[]>();

  for (const [season, entries] of map.entries()) {
    const sorted = [...entries].sort((a, b) => a.log_date.localeCompare(b.log_date));

    const points: DaysOutPoint[] = sorted.map((entry, i) => {
      // parseLocalDateStr を使い new Date("YYYY-MM-DD") の UTC 解釈を回避する
      const logD    = parseLocalDateStr(entry.log_date);
      const targetD = parseLocalDateStr(entry.target_date);
      const daysOut = logD && targetD
        ? Math.round((logD.getTime() - targetD.getTime()) / 86_400_000)
        : 0;

      // 7日移動平均
      const window = sorted.slice(Math.max(0, i - 6), i + 1).map((e) => e.weight);
      const sma7 = window.reduce((a, b) => a + b, 0) / window.length;

      return { daysOut, weight: entry.weight, sma7, season };
    });

    result.set(season, points);
  }

  return result;
}

// ─── マイルストーン比較 ──────────────────────────────────────────────────────

/**
 * 大会◯日前マイルストーンにおける各シーズンの体重。
 * bySeasons は season → sma7 (なければ weight, データなしは null)。
 */
export interface MilestoneRow {
  /** 大会日からの日数 (負 = 大会前). 例: -90 = 大会 90 日前 */
  daysOut: number;
  /** season → その日付付近 (±tolerance 日以内) の sma7 または weight */
  bySeasons: Record<string, number | null>;
}

/**
 * 指定したマイルストーン日数における各シーズンの体重を抽出する。
 *
 * ±tolerance 日以内で最も近いデータポイントの sma7 を返す。
 * その範囲にデータがない場合は null。
 *
 * @param seriesMap  buildDaysOutSeries の戻り値
 * @param milestones 調査したい daysOut 値リスト (例: [-180, -90, -30])
 * @param tolerance  許容誤差日数 (デフォルト 3)
 */
export function buildMilestoneRows(
  seriesMap: Map<string, DaysOutPoint[]>,
  milestones: number[],
  tolerance = 3
): MilestoneRow[] {
  const seasons = Array.from(seriesMap.keys());

  return milestones.map((m) => {
    const bySeasons: Record<string, number | null> = {};

    for (const season of seasons) {
      const points = seriesMap.get(season) ?? [];
      let best: DaysOutPoint | null = null;
      let bestDist = Infinity;

      for (const p of points) {
        const dist = Math.abs(p.daysOut - m);
        if (dist <= tolerance && dist < bestDist) {
          bestDist = dist;
          best = p;
        }
      }

      bySeasons[season] = best !== null ? (best.sma7 ?? best.weight) : null;
    }

    return { daysOut: m, bySeasons };
  });
}

// ─── 今日基準近傍比較 ──────────────────────────────────────────────────────────

/**
 * 今日基準近傍ウィンドウの各シーズン集計結果。
 * buildTodayWindowEntries() の戻り値の要素型。
 */
export interface TodayWindowEntry {
  season: string;
  /** ウィンドウ内のデータ点数 (0 = データなし) */
  count: number;
  /** ウィンドウ内の体重平均 (sma7 優先). データなしは null */
  avgWeight: number | null;
  /** ウィンドウ内データの daysOut 中心値 (参考表示用). データなしは null */
  centerDaysOut: number | null;
}

/**
 * 今日の daysOut を計算する (大会日からの相対日数; 大会前は負値)。
 * 入力が不正な場合は null を返す。
 */
export function calcTodayDaysOut(todayStr: string, contestDateStr: string): number | null {
  const today = parseLocalDateStr(todayStr);
  const contest = parseLocalDateStr(contestDateStr);
  if (!today || !contest) return null;
  return Math.round((today.getTime() - contest.getTime()) / 86_400_000);
}

/**
 * 今日の daysOut を基準に ±windowDays の範囲で各シーズンの体重を集計する。
 *
 * - sma7 が利用可能なデータポイントを優先して平均を算出する
 * - ウィンドウ内にデータがないシーズンは count=0, avgWeight=null を返す
 *
 * @param seriesMap  buildDaysOutSeries の戻り値
 * @param todayDaysOut  現在シーズンの今日の daysOut (通常は負値)
 * @param windowDays    ウィンドウ半径 (デフォルト 7)
 */
export function buildTodayWindowEntries(
  seriesMap: Map<string, DaysOutPoint[]>,
  todayDaysOut: number,
  windowDays = 7
): TodayWindowEntry[] {
  return Array.from(seriesMap.entries()).map(([season, points]) => {
    const inWindow = points.filter(
      (p) =>
        p.daysOut >= todayDaysOut - windowDays &&
        p.daysOut <= todayDaysOut + windowDays
    );

    if (inWindow.length === 0) {
      return { season, count: 0, avgWeight: null, centerDaysOut: null };
    }

    const weightSum = inWindow.reduce((sum, p) => sum + (p.sma7 ?? p.weight), 0);
    const avgWeight = Math.round((weightSum / inWindow.length) * 10) / 10;
    const daysOutSum = inWindow.reduce((sum, p) => sum + p.daysOut, 0);
    const centerDaysOut = Math.round(daysOutSum / inWindow.length);

    return { season, count: inWindow.length, avgWeight, centerDaysOut };
  });
}

/** days_out 軸の全シーズン統合テーブル（Recharts 用） */
export function buildDaysOutChartData(
  seriesMap: Map<string, DaysOutPoint[]>,
  minDaysOut = -300,
  maxDaysOut = 0
): Array<Record<string, number | null>> {
  const allDaysOut = new Set<number>();
  for (const points of seriesMap.values()) {
    for (const p of points) {
      if (p.daysOut >= minDaysOut && p.daysOut <= maxDaysOut) {
        allDaysOut.add(p.daysOut);
      }
    }
  }

  const seasons = Array.from(seriesMap.keys());

  return Array.from(allDaysOut)
    .sort((a, b) => a - b)
    .map((daysOut) => {
      const row: Record<string, number | null> = { daysOut };
      for (const season of seasons) {
        const point = seriesMap.get(season)?.find((p) => p.daysOut === daysOut);
        row[season] = point?.sma7 ?? null;
      }
      return row;
    });
}
