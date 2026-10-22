export type ShiftDef = { name: string; startHour: number; endHour: number };

/** Shifts may wrap past midnight (endHour < startHour). */
export const DEFAULT_SHIFTS: ShiftDef[] = [
  { name: "Day", startHour: 7, endHour: 15 },
  { name: "Evening", startHour: 15, endHour: 23 },
  { name: "Night", startHour: 23, endHour: 7 },
];

export const MANPOWER_CONFIG = {
  utilisation: 0.75,
  /** A trade needs on-site cover (min 1) if it has demand in a shift in at least this share of weeks. */
  coverageWeekShare: 0.25,
  /** Percentile of weekly demand used when "Plan for peak" is on. */
  peakPercentile: 0.85,
  /** Observed man-hours are clamped to this range. */
  minObservedHours: 0.25,
  maxObservedHours: 8,
  /** Minimum observations required before the observed median overrides the default. */
  minObservationsForOverride: 5,
};
