import { describe, expect, it } from "vitest";
import { aggregateSla, computeSla, latestTimestamp } from "@/lib/analysis/sla";

const t = (h: number) => new Date(Date.UTC(2025, 2, 5, 8) + h * 3_600_000);

describe("computeSla", () => {
  it("measures response and turnaround from the reported time", () => {
    const s = computeSla({ reportedAt: t(0), respondedAt: t(1.5), completedAt: t(3.5), statusNormalised: "Closed" }, t(100));
    expect(s.responseHours).toBeCloseTo(1.5);
    expect(s.turnaroundHours).toBeCloseTo(3.5);
    expect(s.responseMet).toBe(true);
    expect(s.turnaroundMet).toBe(true);
    expect(s.isOpen).toBe(false);
  });

  it("treats exactly 2 h / 4 h as met and anything above as breached", () => {
    expect(computeSla({ reportedAt: t(0), respondedAt: t(2), completedAt: t(4), statusNormalised: "Closed" }, undefined)).toMatchObject({
      responseMet: true,
      turnaroundMet: true,
    });
    expect(
      computeSla({ reportedAt: t(0), respondedAt: t(2.01), completedAt: t(4.01), statusNormalised: "Closed" }, undefined),
    ).toMatchObject({ responseMet: false, turnaroundMet: false });
  });

  it("ages open records against the reference date", () => {
    const s = computeSla({ reportedAt: t(0), statusNormalised: "Open" }, t(10));
    expect(s.isOpen).toBe(true);
    expect(s.ageHours).toBeCloseTo(10);
    expect(s.openBreached).toBe(true);
    expect(computeSla({ reportedAt: t(0), statusNormalised: "Open" }, t(3)).openBreached).toBe(false);
  });

  it("returns undefined (n/a) rather than zero for missing timestamps", () => {
    const s = computeSla({ statusNormalised: "Closed" }, t(10));
    expect(s.responseHours).toBeUndefined();
    expect(s.turnaroundMet).toBeUndefined();
    expect(s.ageHours).toBeUndefined();
  });

  it("flags negative and implausible durations and excludes them", () => {
    const neg = computeSla({ reportedAt: t(5), respondedAt: t(1), statusNormalised: "Closed" }, undefined);
    expect(neg.responseHours).toBeUndefined();
    expect(neg.dataQualityIssue).toMatch(/Negative/);
    const long = computeSla({ reportedAt: t(0), completedAt: t(24 * 400), statusNormalised: "Closed" }, undefined);
    expect(long.turnaroundHours).toBeUndefined();
    expect(long.dataQualityIssue).toMatch(/Implausible/);
  });
});

describe("aggregateSla / latestTimestamp", () => {
  it("aggregates compliance over known outcomes only", () => {
    const infos = [
      computeSla({ reportedAt: t(0), respondedAt: t(1), completedAt: t(3), statusNormalised: "Closed" }, undefined),
      computeSla({ reportedAt: t(0), respondedAt: t(3), completedAt: t(5), statusNormalised: "Closed" }, undefined),
      computeSla({ statusNormalised: "Closed" }, undefined),
    ];
    const agg = aggregateSla(infos);
    expect(agg).toMatchObject({ responseKnown: 2, responseMet: 1, tatKnown: 2, tatMet: 1, breached: 1, assessable: 2 });
  });

  it("finds the latest timestamp across all date fields", () => {
    expect(latestTimestamp([{ reportedAt: t(0), completedAt: t(9), statusNormalised: "Closed" }, { reportedAt: t(5), statusNormalised: "Open" }])).toEqual(t(9));
  });
});
