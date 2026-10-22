import { describe, expect, it } from "vitest";
import { DEFAULT_WEIGHTS } from "@/config/scoring";
import {
  bandFor,
  frequencyComponent,
  impactComponent,
  normaliseWeights,
  p95ClusterSize,
  scoreCluster,
  scoreRecord,
  slaComponent,
} from "@/lib/analysis/scoring";
import type { SlaInfo } from "@/lib/types";

const slaMet: SlaInfo = { responseMet: true, turnaroundMet: true, isOpen: false };
const slaTatBreach: SlaInfo = { responseMet: true, turnaroundMet: false, isOpen: false };
const slaRespBreach: SlaInfo = { responseMet: false, turnaroundMet: true, isOpen: false };
const slaUnknown: SlaInfo = { isOpen: false };
const slaOpenOld: SlaInfo = { isOpen: true, ageHours: 10, openBreached: true };

describe("components", () => {
  it("impact = (severity − 1) / 4 with a capped Safety/Security bonus", () => {
    expect(impactComponent(1, "Cosmetic")).toBe(0);
    expect(impactComponent(3, "Comfort")).toBe(0.5);
    expect(impactComponent(3, "Safety")).toBeCloseTo(0.6);
    expect(impactComponent(5, "Security")).toBe(1);
  });

  it("frequency uses log scaling against P95 cluster size, with a repeat bonus", () => {
    expect(frequencyComponent(1, 7, false)).toBeCloseTo(Math.log(2) / Math.log(8));
    expect(frequencyComponent(7, 7, false)).toBe(1);
    expect(frequencyComponent(20, 7, false)).toBe(1);
    expect(frequencyComponent(1, 7, true)).toBeCloseTo(Math.log(2) / Math.log(8) + 0.2);
    expect(frequencyComponent(6, 7, true)).toBe(1);
  });

  it("SLA component follows the rubric", () => {
    expect(slaComponent(slaTatBreach).value).toBe(1);
    expect(slaComponent(slaOpenOld).value).toBe(1);
    expect(slaComponent(slaRespBreach).value).toBe(0.6);
    expect(slaComponent(slaMet).value).toBe(0);
    expect(slaComponent(slaUnknown).value).toBe(0.3);
  });

  it("P95 is computed over multi-member clusters", () => {
    expect(p95ClusterSize([1, 1, 1, 1])).toBe(1);
    expect(p95ClusterSize([1, 1, 2, 2, 2, 10])).toBeCloseTo(8.8);
  });
});

describe("scoreRecord", () => {
  it("matches the formula 100 × Σ w·component", () => {
    const b = scoreRecord(
      { severity: 5, impact: "Security", clusterSize: 7, isLocationRepeat: false, criticality: "High", sla: slaTatBreach },
      DEFAULT_WEIGHTS,
      7,
    );
    // 100 × (0.35·1 + 0.25·1 + 0.20·1 + 0.20·1) = 100
    expect(b.score).toBeCloseTo(100);
    expect(b.band).toBe("P1");

    const c = scoreRecord(
      { severity: 3, impact: "Comfort", clusterSize: 1, isLocationRepeat: false, criticality: "Medium", sla: slaMet },
      DEFAULT_WEIGHTS,
      7,
    );
    const expected = 100 * (0.35 * 0.5 + 0.25 * (Math.log(2) / Math.log(8)) + 0.2 * 0.5 + 0.2 * 0);
    expect(c.score).toBeCloseTo(expected);
    expect(c.contributions.impact + c.contributions.frequency + c.contributions.location + c.contributions.sla).toBeCloseTo(c.score);
  });

  it("normalises weights that do not sum to 1", () => {
    const w = normaliseWeights({ impact: 2, frequency: 1, location: 1, sla: 0 });
    expect(w.impact + w.frequency + w.location + w.sla).toBeCloseTo(1);
    expect(w.impact).toBeCloseTo(0.5);
    const b = scoreRecord(
      { severity: 5, impact: "Comfort", clusterSize: 1, isLocationRepeat: false, criticality: "Low", sla: slaMet },
      { impact: 2, frequency: 0, location: 0, sla: 0 },
      5,
    );
    expect(b.score).toBeCloseTo(100);
  });

  it("location overrides change the score", () => {
    const base = { severity: 3, impact: "Comfort" as const, clusterSize: 1, isLocationRepeat: false, sla: slaMet };
    const high = scoreRecord({ ...base, criticality: "High" }, DEFAULT_WEIGHTS, 5).score;
    const low = scoreRecord({ ...base, criticality: "Low" }, DEFAULT_WEIGHTS, 5).score;
    expect(high - low).toBeCloseTo(100 * 0.2 * (1 - 0.2));
  });
});

describe("bands and cluster score", () => {
  it("bands at 75 / 55 / 35", () => {
    expect(bandFor(75)).toBe("P1");
    expect(bandFor(74.9)).toBe("P2");
    expect(bandFor(55)).toBe("P2");
    expect(bandFor(54.9)).toBe("P3");
    expect(bandFor(35)).toBe("P3");
    expect(bandFor(34.9)).toBe("P4");
  });

  it("cluster score = P75 × (1 + 0.05 × min(10, locations)), capped at 100", () => {
    expect(scoreCluster([40, 50, 60, 70], 1)).toBeCloseTo(62.5 * 1.05);
    expect(scoreCluster([40, 50, 60, 70], 20)).toBeCloseTo(Math.min(100, 62.5 * 1.5));
    expect(scoreCluster([90, 95], 10)).toBe(100);
  });
});
