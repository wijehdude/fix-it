import { SLA_CONFIG } from "@/config/sla";
import type { DefectRecord, SlaInfo } from "@/lib/types";

const HOUR = 3_600_000;

type SlaRecord = Pick<DefectRecord, "reportedAt" | "respondedAt" | "completedAt" | "statusNormalised">;

/** Duration in hours between two dates; undefined if implausible (negative or > maxPlausibleHours). */
function duration(from: Date | undefined, to: Date | undefined): { hours?: number; issue?: string } {
  if (!from || !to) return {};
  const h = (to.getTime() - from.getTime()) / HOUR;
  if (h < 0) return { issue: "Negative duration" };
  if (h > SLA_CONFIG.maxPlausibleHours) return { issue: "Implausible duration (> 365 days)" };
  return { hours: h };
}

/**
 * Computes SLA metrics for a record (calendar time, 24/7):
 * - response = respondedAt − reportedAt, met if ≤ 2 h
 * - turnaround = completedAt − reportedAt, met if ≤ 4 h
 * - for open records (no completedAt and not Closed), age = referenceDate − reportedAt
 */
export function computeSla(r: SlaRecord, referenceDate: Date | undefined): SlaInfo {
  const issues: string[] = [];
  const resp = duration(r.reportedAt, r.respondedAt);
  const tat = duration(r.reportedAt, r.completedAt);
  if (resp.issue) issues.push(`Response: ${resp.issue}`);
  if (tat.issue) issues.push(`Turnaround: ${tat.issue}`);

  const isOpen = !r.completedAt && r.statusNormalised !== "Closed";
  let ageHours: number | undefined;
  if (isOpen && r.reportedAt && referenceDate) {
    const a = duration(r.reportedAt, referenceDate);
    ageHours = a.hours;
  }

  return {
    responseHours: resp.hours,
    turnaroundHours: tat.hours,
    ageHours,
    responseMet: resp.hours === undefined ? undefined : resp.hours <= SLA_CONFIG.responseHours,
    turnaroundMet: tat.hours === undefined ? undefined : tat.hours <= SLA_CONFIG.turnaroundHours,
    isOpen,
    openBreached: ageHours === undefined ? undefined : ageHours > SLA_CONFIG.turnaroundHours,
    dataQualityIssue: issues.length ? issues.join("; ") : undefined,
  };
}

/** Latest timestamp across all date fields — the default reference date for open-item ageing. */
export function latestTimestamp(records: SlaRecord[]): Date | undefined {
  let max = -Infinity;
  for (const r of records) {
    for (const d of [r.reportedAt, r.respondedAt, r.completedAt]) {
      if (d && d.getTime() > max) max = d.getTime();
    }
  }
  return Number.isFinite(max) ? new Date(max) : undefined;
}

export type SlaAggregate = {
  responseKnown: number;
  responseMet: number;
  tatKnown: number;
  tatMet: number;
  /** Records breaching either SLA (including open records past the TAT target). */
  breached: number;
  /** Records where at least one SLA outcome is known. */
  assessable: number;
};

export function aggregateSla(infos: SlaInfo[]): SlaAggregate {
  const agg: SlaAggregate = { responseKnown: 0, responseMet: 0, tatKnown: 0, tatMet: 0, breached: 0, assessable: 0 };
  for (const s of infos) {
    if (s.responseMet !== undefined) {
      agg.responseKnown++;
      if (s.responseMet) agg.responseMet++;
    }
    if (s.turnaroundMet !== undefined) {
      agg.tatKnown++;
      if (s.turnaroundMet) agg.tatMet++;
    }
    const known = s.responseMet !== undefined || s.turnaroundMet !== undefined || s.openBreached !== undefined;
    if (known) agg.assessable++;
    if (s.responseMet === false || s.turnaroundMet === false || s.openBreached === true) agg.breached++;
  }
  return agg;
}
