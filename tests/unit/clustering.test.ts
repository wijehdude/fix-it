import { describe, expect, it } from "vitest";
import { agglomerativeCluster, findLocationRepeats } from "@/lib/analysis/clustering";
import { keywordClassify, legacyToCategory, lockedCategoryFor } from "@/lib/analysis/preclassify";
import { normaliseLocation } from "@/lib/analysis/locations";

describe("agglomerativeCluster", () => {
  it("groups vectors above the cosine threshold", () => {
    const v = [
      [1, 0, 0],
      [0.98, 0.05, 0],
      [0.95, 0.1, 0.02],
      [0, 1, 0],
      [0.02, 0.97, 0.05],
      [0, 0, 1],
    ];
    const labels = agglomerativeCluster(v, 0.9);
    expect(labels[0]).toBe(labels[1]);
    expect(labels[1]).toBe(labels[2]);
    expect(labels[3]).toBe(labels[4]);
    expect(labels[0]).not.toBe(labels[3]);
    expect(labels[5]).not.toBe(labels[0]);
    expect(labels[5]).not.toBe(labels[3]);
    expect(new Set(labels).size).toBe(3);
  });

  it("respects the threshold (stricter → more clusters)", () => {
    const v = [
      [1, 0],
      [0.9, 0.44],
      [0.7, 0.71],
    ];
    expect(new Set(agglomerativeCluster(v, 0.5)).size).toBe(1);
    expect(new Set(agglomerativeCluster(v, 0.999)).size).toBe(3);
  });

  it("uses average linkage (not single linkage chaining)", () => {
    // a–b similar, b–c similar, but a–c dissimilar: average linkage keeps c out at a high threshold.
    const a = [1, 0];
    const b = [Math.cos(0.25), Math.sin(0.25)];
    const c = [Math.cos(0.55), Math.sin(0.55)];
    const labels = agglomerativeCluster([a, b, c], Math.cos(0.32));
    expect(labels[0]).toBe(labels[1]);
    expect(labels[2]).not.toBe(labels[0]);
  });

  it("handles trivial inputs", () => {
    expect(agglomerativeCluster([], 0.8)).toEqual([]);
    expect(agglomerativeCluster([[1, 2]], 0.8)).toEqual([0]);
  });
});

describe("findLocationRepeats", () => {
  const d = (day: number) => new Date(Date.UTC(2025, 0, day));
  it("marks ≥ 2 records at the same category + location within 30 days", () => {
    const set = findLocationRepeats(
      [
        { id: "a", category: "Toilet", location: "level 4 male toilet", reportedAt: d(1), isDuplicate: false },
        { id: "b", category: "Toilet", location: "level 4 male toilet", reportedAt: d(20), isDuplicate: false },
        { id: "c", category: "Toilet", location: "level 4 male toilet", reportedAt: d(90), isDuplicate: false },
        { id: "e", category: "Air Con", location: "level 4 male toilet", reportedAt: d(2), isDuplicate: false },
        { id: "f", category: "Toilet", location: "level 2", reportedAt: d(1), isDuplicate: false },
        { id: "g", category: "Toilet", location: "level 2", reportedAt: d(1), isDuplicate: true },
      ],
      2,
      30,
    );
    expect([...set].sort()).toEqual(["a", "b"]);
  });
});

describe("keyword pre-classifier", () => {
  it("maps legacy sheet names", () => {
    expect(legacyToCategory("Aircon")).toBe("Air Con");
    expect(legacyToCategory("Lighting Defects")).toBe("Lighting");
    expect(legacyToCategory("Security")).toBe("Physical Security");
    expect(legacyToCategory("Others")).toBeNull();
  });

  it("applies the toilet-over-cleaning rule", () => {
    expect(keywordClassify({ description: "Floor very dirty", location: "L4 Male Toilet" }).category).toBe("Toilet");
    expect(keywordClassify({ description: "Floor very dirty", location: "L5 Office" }).category).toBe("Cleaning");
  });

  it("locks only when confident and agreeing with a specific legacy sheet", () => {
    expect(lockedCategoryFor({ description: "Aircon not cold", legacyCategory: "Aircon" })).toBe("Air Con");
    expect(lockedCategoryFor({ description: "Aircon not cold", legacyCategory: "Others" })).toBeNull();
    expect(lockedCategoryFor({ description: "Lift stuck", legacyCategory: "Aircon" })).toBeNull();
  });
});

describe("normaliseLocation", () => {
  it("expands common abbreviations", () => {
    expect(normaliseLocation("L3 Meeting Rm 3-01")).toBe("level 3 meeting room 3 - 01");
    expect(normaliseLocation("Lvl 3  Meeting Room 3-01")).toBe("level 3 meeting room 3 - 01");
    expect(normaliseLocation("Level 3 meeting room 3-01")).toBe("level 3 meeting room 3 - 01");
    expect(normaliseLocation("  ")).toBeUndefined();
  });
});
