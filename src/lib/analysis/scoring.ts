import { PRIORITY_BANDS, SCORING_CONFIG, type PriorityBand, type ScoringWeights } from "@/config/scoring";
import type { Criticality } from "@/config/locations";
import type { OperationalImpact, ScoreBreakdown, SlaInfo } from "@/lib/types";
import { percentile } from "./stats";

/** Normalises weights so they sum to 1. Falls back to equal weights if all are zero. */
export function normaliseWeights(w: ScoringWeights): ScoringWeights {
  const sum = w.impact + w.frequency + w.location + w.sla;
  if (sum <= 0) return { impact: 0.25, frequency: 0.25, location: 0.25, sla: 0.25 };
  return { impact: w.impact / sum, frequency: w.frequency / sum, location: w.location / sum, sla: w.sla / sum };
}

export function bandFor(score: number): PriorityBand {
  if (score >= PRIORITY_BANDS.P1) return "P1";
  if (score >= PRIORITY_BANDS.P2) return "P2";
  if (score >= PRIORITY_BANDS.P3) return "P3";
  return "P4";
}

/** Impact: (severity − 1) / 4, +0.1 if Safety or Security (capped at 1). */
export function impactComponent(severity: number | undefined, impact: OperationalImpact | undefined): number {
  if (!severity) return 0.5;
  let v = (severity - 1) / 4;
  if (impact === "Safety" || impact === "Security") v += SCORING_CONFIG.safetySecurityBonus;
  return Math.min(1, Math.max(0, v));
}

/** Frequency: min(1, log(1 + size) / log(1 + P95 size)), +0.2 for a location repeat (capped at 1). */
export function frequencyComponent(clusterSize: number, p95ClusterSize: number, isLocationRepeat: boolean): number {
  const denom = Math.log(1 + Math.max(1, p95ClusterSize));
  let v = Math.min(1, Math.log(1 + Math.max(0, clusterSize)) / denom);
  if (isLocationRepeat) v += SCORING_CONFIG.locationRepeatBonus;
  return Math.min(1, v);
}

export function locationComponent(c: Criticality | "Unknown"): number {
  return SCORING_CONFIG.locationValue[c];
}

/**
 * SLA: 1.0 if TAT breached or (open and age > 4 h); 0.6 if only the response SLA was breached;
 * 0 if met; 0.3 if unknown.
 */
export function slaComponent(s: SlaInfo): { value: number; note: string } {
  const v = SCORING_CONFIG.slaValue;
  if (s.turnaroundMet === false) return { value: v.tatOrAgeBreach, note: "TAT breached" };
  if (s.isOpen && s.openBreached) return { value: v.tatOrAgeBreach, note: "Open and older than 4 h" };
  if (s.responseMet === false) return { value: v.responseOnlyBreach, note: "Response SLA breached" };
  if (s.turnaroundMet === true) return { value: v.met, note: "SLAs met" };
  if (s.isOpen && s.openBreached === false) return { value: v.met, note: "Open, within SLA so far" };
  return { value: v.unknown, note: "SLA outcome unknown" };
}

/** P95 of cluster sizes, computed over clusters with ≥ 2 members (falls back to the max, then 1). */
export function p95ClusterSize(sizes: number[]): number {
  const multi = sizes.filter((s) => s >= 2);
  const p = percentile(multi.length ? multi : sizes, 0.95);
  return Math.max(1, p ?? 1);
}

export type ScoreInput = {
  severity?: number;
  impact?: OperationalImpact;
  clusterSize: number;
  isLocationRepeat: boolean;
  criticality: Criticality | "Unknown";
  sla: SlaInfo;
};

/** Record priority score: 100 × (wI·Impact + wF·Frequency + wL·Location + wS·SLA). */
export function scoreRecord(input: ScoreInput, weights: ScoringWeights, p95Size: number): ScoreBreakdown {
  const w = normaliseWeights(weights);
  const impact = impactComponent(input.severity, input.impact);
  const frequency = frequencyComponent(input.clusterSize, p95Size, input.isLocationRepeat);
  const location = locationComponent(input.criticality);
  const slaC = slaComponent(input.sla);
  const contributions = {
    impact: 100 * w.impact * impact,
    frequency: 100 * w.frequency * frequency,
    location: 100 * w.location * location,
    sla: 100 * w.sla * slaC.value,
  };
  const score = contributions.impact + contributions.frequency + contributions.location + contributions.sla;
  const notes: string[] = [];
  if (input.severity) notes.push(`Severity ${input.severity}${input.impact ? ` (${input.impact})` : ""}`);
  else notes.push("Severity unknown (0.5 used)");
  notes.push(`Cluster size ${input.clusterSize}${input.isLocationRepeat ? ", repeat at same location" : ""}`);
  notes.push(`Location criticality ${input.criticality}`);
  notes.push(slaC.note);
  return { impact, frequency, location, sla: slaC.value, contributions, score, band: bandFor(score), notes };
}

/** Cluster score = P75(member scores) × (1 + 0.05 × min(10, distinct locations)), capped at 100. */
export function scoreCluster(memberScores: number[], distinctLocations: number): number {
  const p75 = percentile(memberScores, SCORING_CONFIG.clusterPercentile) ?? 0;
  const bonus =
    1 +
    SCORING_CONFIG.clusterLocationBonusPerLocation *
      Math.min(SCORING_CONFIG.clusterLocationBonusMaxLocations, distinctLocations);
  return Math.min(100, p75 * bonus);
}
