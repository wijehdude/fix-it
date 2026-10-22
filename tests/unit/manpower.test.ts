import { describe, expect, it } from "vitest";
import { DEFAULT_SHIFTS } from "@/config/shifts";
import {
  computeManpower,
  observedHours,
  shiftHours,
  shiftIndexForHour,
  tradeFor,
  type ManpowerJob,
  type ManpowerSettings,
} from "@/lib/analysis/manpower";

const settings: ManpowerSettings = {
  shifts: DEFAULT_SHIFTS,
  utilisation: 0.75,
  planForPeak: false,
  useObservedHours: false,
  hoursOverride: {},
};

/** Monday 6 Jan 2025 + d days, at hour h. */
const at = (d: number, h: number) => new Date(Date.UTC(2025, 0, 6 + d, h));

describe("trade mapping", () => {
  it("maps categories, toilet sub-types and Others sub-themes", () => {
    expect(tradeFor({ category: "Air Con" })).toBe("ACMV Technician");
    expect(tradeFor({ category: "Toilet", faultType: "Choked WC" })).toBe("Plumber");
    expect(tradeFor({ category: "Toilet", faultType: "Soap dispenser empty" })).toBe("Cleaner");
    expect(tradeFor({ category: "Toilet", systemFunction: "Sanitary – Consumables" })).toBe("Cleaner");
    expect(tradeFor({ category: "Others", othersSubTheme: "Lift" })).toBe("Lift Contractor");
    expect(tradeFor({ category: "Others", othersSubTheme: "Furniture" })).toBe("General Handyman");
  });
});

describe("shifts", () => {
  it("handles shifts wrapping past midnight", () => {
    expect(shiftHours(DEFAULT_SHIFTS[2])).toBe(8);
    expect(shiftIndexForHour(7, DEFAULT_SHIFTS)).toBe(0);
    expect(shiftIndexForHour(14, DEFAULT_SHIFTS)).toBe(0);
    expect(shiftIndexForHour(15, DEFAULT_SHIFTS)).toBe(1);
    expect(shiftIndexForHour(23, DEFAULT_SHIFTS)).toBe(2);
    expect(shiftIndexForHour(3, DEFAULT_SHIFTS)).toBe(2);
  });
});

describe("computeManpower", () => {
  // 4 weeks; Electrician: 16 jobs every weekday day shift (Mon–Fri) at 09:00 → 4 jobs/day.
  const jobs: ManpowerJob[] = [];
  for (let w = 0; w < 4; w++) {
    for (let d = 0; d < 5; d++) {
      for (let k = 0; k < 4; k++) jobs.push({ trade: "Electrician", reportedAt: at(w * 7 + d, 9) });
    }
  }
  // Plumber: one night job in week 0 only (sporadic).
  jobs.push({ trade: "Plumber", reportedAt: at(1, 2) });
  // A duplicate is ignored.
  jobs.push({ trade: "Electrician", reportedAt: at(0, 9), isDuplicate: true });

  const result = computeManpower(jobs, settings);
  const cell = (trade: string, shift: string) => result.table.find((c) => c.trade === trade && c.shift === shift)!;

  it("counts weeks and builds the day × hour heatmap", () => {
    expect(result.weeks).toBe(4);
    // Monday (1) 09:00: 4 jobs × 4 weeks.
    expect(result.heatmap.Electrician[1][9].count).toBe(16);
    expect(result.heatmap.Electrician[1][9].hours).toBeCloseTo(16 * 0.75);
    expect(result.heatmap.All[0][9].count).toBe(0);
  });

  it("computes average demand per shift and headcount", () => {
    const c = cell("Electrician", "Day");
    // Weekly man-hours = 20 jobs × 0.75 = 15; per shift = 15 / 7.
    expect(c.avgHoursPerShift).toBeCloseTo(15 / 7);
    expect(c.fte).toBeCloseTo(15 / 7 / (8 * 0.75));
    // FTE ≈ 0.36 → workload headcount 1 (ceil(0.36 − 0.1)), and demand every week → coverage 1.
    expect(c.headcount).toBe(1);
    expect(c.coverageMin).toBe(1);
    expect(cell("Electrician", "Night").headcount).toBe(0);
    expect(cell("Electrician", "Night").note).toBe("No demand");
  });

  it("uses on-call when demand is sporadic (< 25% of weeks)", () => {
    const c = cell("Plumber", "Night");
    expect(c.weeksWithDemandShare).toBeCloseTo(0.25 - 0); // 1 of 4 weeks = 25%
    expect(c.coverageMin).toBe(1);
    const sparse = computeManpower(
      [...Array.from({ length: 8 }, (_, w) => ({ trade: "Electrician", reportedAt: at(w * 7, 9) })), { trade: "Plumber", reportedAt: at(1, 2) }],
      settings,
    );
    const p = sparse.table.find((x) => x.trade === "Plumber" && x.shift === "Night")!;
    expect(p.weeksWithDemandShare).toBeCloseTo(1 / 8);
    expect(p.headcount).toBe(0);
    expect(p.note).toMatch(/On-call sufficient/);
  });

  it("plans for the P85 week when the peak toggle is on, and reacts to assumptions", () => {
    const peak = computeManpower(jobs, { ...settings, planForPeak: true });
    expect(peak.table.find((c) => c.trade === "Electrician" && c.shift === "Day")!.demandUsed).toBeCloseTo(15 / 7);
    const heavy = computeManpower(jobs, { ...settings, hoursOverride: { Electrician: 6 } });
    const c = heavy.table.find((x) => x.trade === "Electrician" && x.shift === "Day")!;
    // Weekly = 20 × 6 = 120 h; per shift = 17.14 h; FTE = 17.14 / 6 = 2.86 → 3.
    expect(c.headcount).toBe(3);
    expect(heavy.tradeHours.Electrician.source).toBe("user");
  });

  it("flags an SLA risk when a 2-hour window exceeds rostered capacity", () => {
    const heavy = computeManpower(jobs, { ...settings, hoursOverride: { Electrician: 2 } });
    const c = heavy.table.find((x) => x.trade === "Electrician" && x.shift === "Day")!;
    // Mon 09:00 window: 4 jobs × 2 h per occurrence = 8 h > headcount × 2 × 0.75.
    expect(c.slaRisk).toBe(true);
    expect(c.note).toMatch(/SLA risk: demand spikes Mon 09:00–11:00/);
  });
});

describe("observedHours", () => {
  it("uses the median (completed − responded), clamped to [0.25, 8]", () => {
    const base = Date.UTC(2025, 0, 6, 9);
    const mk = (h: number): ManpowerJob => ({
      trade: "Plumber",
      respondedAt: new Date(base),
      completedAt: new Date(base + h * 3_600_000),
    });
    expect(observedHours([mk(1), mk(2), mk(3)]).Plumber).toEqual({ count: 3, median: 2 });
    expect(observedHours([mk(0.05)]).Plumber.median).toBe(0.25);
    expect(observedHours([mk(20)]).Plumber.median).toBe(8);
  });

  it("overrides default hours only with enough observations", () => {
    const base = Date.UTC(2025, 0, 6, 9);
    const obsJobs = Array.from({ length: 5 }, () => ({
      trade: "Plumber",
      reportedAt: new Date(base),
      respondedAt: new Date(base),
      completedAt: new Date(base + 3 * 3_600_000),
    }));
    const r = computeManpower(obsJobs, { ...settings, useObservedHours: true });
    expect(r.tradeHours.Plumber).toMatchObject({ used: 3, source: "observed" });
    const r2 = computeManpower(obsJobs.slice(0, 4), { ...settings, useObservedHours: true });
    expect(r2.tradeHours.Plumber).toMatchObject({ used: 1, source: "default" });
  });
});
