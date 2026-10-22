/** SLA targets, measured from the reported time. Calendar time (24/7). */
export const SLA_CONFIG = {
  responseHours: 2,
  turnaroundHours: 4,
  /** Durations above this (in hours) are treated as implausible data-quality issues. */
  maxPlausibleHours: 365 * 24,
  /** "calendar" = 24/7. Business-hours SLA clocks are not implemented in v1. */
  clock: "calendar" as const,
};
