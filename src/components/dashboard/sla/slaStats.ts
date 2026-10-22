import type { EnrichedRecord } from "@/lib/analysis/derive";

export type ComplianceRow = {
  key: string;
  label: string;
  total: number;
  respKnown: number;
  respMet: number;
  tatKnown: number;
  tatMet: number;
  /** % met, or undefined (n/a) when no outcome is known. */
  respPct?: number;
  tatPct?: number;
};

/** Groups records and computes response / TAT compliance per group. */
export function groupCompliance(
  records: EnrichedRecord[],
  keyFn: (r: EnrichedRecord) => string | undefined,
  labelFn: (key: string) => string = (k) => k,
): ComplianceRow[] {
  const groups = new Map<string, ComplianceRow>();
  for (const r of records) {
    const key = keyFn(r);
    if (!key) continue;
    const g = groups.get(key) ?? { key, label: labelFn(key), total: 0, respKnown: 0, respMet: 0, tatKnown: 0, tatMet: 0 };
    g.total++;
    if (r.sla.responseMet !== undefined) {
      g.respKnown++;
      if (r.sla.responseMet) g.respMet++;
    }
    if (r.sla.turnaroundMet !== undefined) {
      g.tatKnown++;
      if (r.sla.turnaroundMet) g.tatMet++;
    }
    groups.set(key, g);
  }
  return [...groups.values()].map((g) => ({
    ...g,
    respPct: g.respKnown ? (g.respMet / g.respKnown) * 100 : undefined,
    tatPct: g.tatKnown ? (g.tatMet / g.tatKnown) * 100 : undefined,
  }));
}

export type Bin = { label: string; lo: number; hi: number };

export const HOUR_BINS: Bin[] = [
  { label: "0–0.5", lo: 0, hi: 0.5 },
  { label: "0.5–1", lo: 0.5, hi: 1 },
  { label: "1–1.5", lo: 1, hi: 1.5 },
  { label: "1.5–2", lo: 1.5, hi: 2 },
  { label: "2–3", lo: 2, hi: 3 },
  { label: "3–4", lo: 3, hi: 4 },
  { label: "4–6", lo: 4, hi: 6 },
  { label: "6–8", lo: 6, hi: 8 },
  { label: "8–12", lo: 8, hi: 12 },
  { label: "12–24", lo: 12, hi: 24 },
  { label: "> 24", lo: 24, hi: Infinity },
];

/** Histogram over HOUR_BINS. A value equal to a target (e.g. exactly 2 h) counts in the lower bin, matching "met if ≤". */
export function histogram(values: number[], bins: Bin[] = HOUR_BINS): { label: string; count: number; lo: number }[] {
  const counts = bins.map(() => 0);
  for (const v of values) {
    let i = bins.findIndex((b) => v > b.lo && v <= b.hi);
    if (i < 0) i = v <= 0 ? 0 : bins.length - 1;
    counts[i]++;
  }
  return bins.map((b, i) => ({ label: b.label, count: counts[i], lo: b.lo }));
}
