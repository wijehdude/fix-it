import { MANPOWER_CONFIG, type ShiftDef } from "@/config/shifts";
import {
  CATEGORY_TRADE,
  DEFAULT_OTHERS_TRADE,
  OTHERS_SUBTHEME_TRADE,
  TOILET_CLEANER_PATTERN,
  TOILET_TRADES,
  TRADE_DEFAULT_HOURS,
} from "@/config/trades";
import type { Category } from "@/lib/types";
import { clamp, mean, median, percentile } from "./stats";

const HOUR = 3_600_000;
const DAY = 86_400_000;
const WEEK = 7 * DAY;
export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** Display order: Monday first. */
export const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function tradeFor(input: {
  category: Category;
  othersSubTheme?: string;
  systemFunction?: string;
  faultType?: string;
  description?: string;
}): string {
  if (input.category === "Toilet") {
    const text = `${input.systemFunction ?? ""} ${input.faultType ?? ""} ${input.description ?? ""}`;
    if (/consumables/i.test(input.systemFunction ?? "")) return TOILET_TRADES.cleanliness;
    if (/fixture|plumbing|drain/i.test(input.systemFunction ?? "")) return TOILET_TRADES.fixture;
    return TOILET_CLEANER_PATTERN.test(text) ? TOILET_TRADES.cleanliness : TOILET_TRADES.fixture;
  }
  if (input.category === "Others") {
    const sub = input.othersSubTheme?.trim();
    if (sub) {
      const hit = Object.entries(OTHERS_SUBTHEME_TRADE).find(([k]) => k.toLowerCase() === sub.toLowerCase());
      if (hit) return hit[1];
    }
    return DEFAULT_OTHERS_TRADE;
  }
  return CATEGORY_TRADE[input.category];
}

export function shiftHours(s: ShiftDef): number {
  const h = (s.endHour - s.startHour + 24) % 24;
  return h === 0 ? 24 : h;
}

/** Index of the shift containing the given hour (0–23), or -1 if none covers it. */
export function shiftIndexForHour(hour: number, shifts: ShiftDef[]): number {
  return shifts.findIndex((s) =>
    s.startHour < s.endHour ? hour >= s.startHour && hour < s.endHour : hour >= s.startHour || hour < s.endHour,
  );
}

export type ManpowerJob = {
  trade: string;
  reportedAt?: Date;
  respondedAt?: Date;
  completedAt?: Date;
  isDuplicate?: boolean;
};

export type ManpowerSettings = {
  shifts: ShiftDef[];
  utilisation: number;
  planForPeak: boolean;
  useObservedHours: boolean;
  /** User-edited man-hours per job, by trade. */
  hoursOverride: Record<string, number>;
};

export type TradeHours = {
  trade: string;
  defaultHours: number;
  observedMedian?: number;
  observedCount: number;
  used: number;
  source: "default" | "observed" | "user";
};

export type HeatCell = { count: number; hours: number };

export type ShiftCell = {
  trade: string;
  shift: string;
  totalHours: number;
  jobs: number;
  avgHoursPerShift: number;
  peakHoursPerShift: number;
  demandUsed: number;
  fte: number;
  weeksWithDemandShare: number;
  coverageMin: number;
  headcount: number;
  note: string;
  slaRisk: boolean;
};

export type ManpowerResult = {
  weeks: number;
  trades: string[];
  tradeHours: Record<string, TradeHours>;
  /** heatmap[trade or "All"][dayOfWeek 0=Sun][hour] */
  heatmap: Record<string, HeatCell[][]>;
  table: ShiftCell[];
  jobsWithoutTime: number;
};

const pad = (n: number) => String(n).padStart(2, "0");

/** Median observed (completed − responded) per trade, clamped to [0.25, 8] h. */
export function observedHours(jobs: ManpowerJob[]): Record<string, { median?: number; count: number }> {
  const byTrade = new Map<string, number[]>();
  for (const j of jobs) {
    if (j.isDuplicate || !j.respondedAt || !j.completedAt) continue;
    const h = (j.completedAt.getTime() - j.respondedAt.getTime()) / HOUR;
    if (!(h > 0) || h > 24 * 30) continue;
    const arr = byTrade.get(j.trade) ?? [];
    arr.push(h);
    byTrade.set(j.trade, arr);
  }
  const out: Record<string, { median?: number; count: number }> = {};
  for (const [trade, arr] of byTrade) {
    const m = median(arr);
    out[trade] = {
      count: arr.length,
      median: m === undefined ? undefined : clamp(m, MANPOWER_CONFIG.minObservedHours, MANPOWER_CONFIG.maxObservedHours),
    };
  }
  return out;
}

function emptyHeat(): HeatCell[][] {
  return Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => ({ count: 0, hours: 0 })));
}

/**
 * Recommended headcount per trade per shift:
 *   FTE = demand per shift / (shift hours × utilisation)
 *   headcount = max(ceil(FTE − 0.1), coverageMin)
 * where demand per shift = mean weekly man-hours in that shift ÷ 7 (or the P85 week when planning for peak),
 * and coverageMin = 1 if the trade has demand in that shift in ≥ 25% of weeks, else 0 (on-call).
 */
export function computeManpower(jobs: ManpowerJob[], settings: ManpowerSettings): ManpowerResult {
  const live = jobs.filter((j) => !j.isDuplicate);
  const observed = observedHours(live);
  const trades = [...new Set(live.map((j) => j.trade))].sort();

  const tradeHours: Record<string, TradeHours> = {};
  for (const trade of trades) {
    const def = TRADE_DEFAULT_HOURS[trade] ?? 1;
    const obs = observed[trade];
    const obsOk = obs?.median !== undefined && obs.count >= MANPOWER_CONFIG.minObservationsForOverride;
    let used = def;
    let source: TradeHours["source"] = "default";
    if (settings.useObservedHours && obsOk) {
      used = obs!.median!;
      source = "observed";
    }
    if (settings.hoursOverride[trade] !== undefined && settings.hoursOverride[trade] > 0) {
      used = settings.hoursOverride[trade];
      source = "user";
    }
    tradeHours[trade] = { trade, defaultHours: def, observedMedian: obs?.median, observedCount: obs?.count ?? 0, used, source };
  }

  const timed = live.filter((j) => j.reportedAt);
  const heatmap: Record<string, HeatCell[][]> = { All: emptyHeat() };
  for (const t of trades) heatmap[t] = emptyHeat();

  if (timed.length === 0) {
    return { weeks: 0, trades, tradeHours, heatmap, table: [], jobsWithoutTime: live.length };
  }

  const times = timed.map((j) => j.reportedAt!.getTime());
  const t0 = Math.floor(Math.min(...times) / DAY) * DAY;
  const tMax = Math.max(...times);
  const weeks = Math.max(1, Math.ceil((Math.floor((tMax - t0) / DAY) + 1) / 7));

  // weekly[trade][shift][week] = man-hours
  const weekly = new Map<string, number[][]>();
  const jobsPerCell = new Map<string, number>();
  for (const t of trades) weekly.set(t, settings.shifts.map(() => new Array(weeks).fill(0)));

  for (const j of timed) {
    const d = j.reportedAt!;
    const hrs = tradeHours[j.trade].used;
    const dow = d.getUTCDay();
    const hour = d.getUTCHours();
    for (const key of ["All", j.trade]) {
      const cell = heatmap[key][dow][hour];
      cell.count++;
      cell.hours += hrs;
    }
    const si = shiftIndexForHour(hour, settings.shifts);
    if (si < 0) continue;
    const w = Math.min(weeks - 1, Math.floor((d.getTime() - t0) / WEEK));
    weekly.get(j.trade)![si][w] += hrs;
    const k = `${j.trade}|${si}`;
    jobsPerCell.set(k, (jobsPerCell.get(k) ?? 0) + 1);
  }

  const util = clamp(settings.utilisation, 0.05, 1);
  const table: ShiftCell[] = [];
  for (const trade of trades) {
    settings.shifts.forEach((shift, si) => {
      const series = weekly.get(trade)![si];
      const total = series.reduce((a, b) => a + b, 0);
      const avg = (mean(series) ?? 0) / 7;
      const peak = (percentile(series, MANPOWER_CONFIG.peakPercentile) ?? 0) / 7;
      const demand = settings.planForPeak ? peak : avg;
      const capacity = shiftHours(shift) * util;
      const fte = demand / capacity;
      const share = series.filter((v) => v > 0).length / weeks;
      const coverageMin = share >= MANPOWER_CONFIG.coverageWeekShare ? 1 : 0;
      const headcount = Math.max(Math.max(0, Math.ceil(fte - 0.1)), coverageMin);

      // Peak 2-hour window inside this shift (average man-hours per occurrence).
      let peakLoad = 0;
      let peakLabel = "";
      for (const dow of DAY_ORDER) {
        for (let h = 0; h < 24; h++) {
          if (shiftIndexForHour(h, settings.shifts) !== si || heatmap[trade][dow][h].hours === 0) continue;
          const h2 = (h + 1) % 24;
          const load =
            (heatmap[trade][dow][h].hours + (shiftIndexForHour(h2, settings.shifts) === si ? heatmap[trade][dow][h2].hours : 0)) /
            weeks;
          if (load > peakLoad) {
            peakLoad = load;
            peakLabel = `${DAY_NAMES[dow]} ${pad(h)}:00–${pad((h + 2) % 24)}:00`;
          }
        }
      }
      const twoHourCapacity = headcount * 2 * util;
      const slaRisk = total > 0 && (headcount === 0 ? peakLoad > 0.5 : peakLoad > twoHourCapacity);
      let note: string;
      if (total === 0) note = "No demand";
      else if (slaRisk) note = `SLA risk: demand spikes ${peakLabel}`;
      else if (headcount === 0) note = `On-call sufficient (demand in ${Math.round(share * 100)}% of weeks)`;
      else note = `Covered; busiest ${peakLabel}`;

      table.push({
        trade,
        shift: shift.name,
        totalHours: total,
        jobs: jobsPerCell.get(`${trade}|${si}`) ?? 0,
        avgHoursPerShift: avg,
        peakHoursPerShift: peak,
        demandUsed: demand,
        fte,
        weeksWithDemandShare: share,
        coverageMin,
        headcount,
        note,
        slaRisk,
      });
    });
  }

  return { weeks, trades, tradeHours, heatmap, table, jobsWithoutTime: live.length - timed.length };
}
