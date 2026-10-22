import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { detectColumns, headerScore } from "@/lib/parse/columns";
import { buildRecords } from "@/lib/parse/normalise";
import { detectHeaderRow, parseWorkbook, sheetFromRows } from "@/lib/parse/workbook";

function loadSample() {
  const buf = fs.readFileSync(path.join(process.cwd(), "public", "sample", "sample-defects.xlsx"));
  return parseWorkbook(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, "sample-defects.xlsx");
}

describe("header matching", () => {
  it("scores exact and contained synonyms", () => {
    expect(headerScore("Description", "description")).toBe(1);
    expect(headerScore("Defect Description", "description")).toBeGreaterThan(0.85);
    expect(headerScore("Date Reported", "reportedAt")).toBe(1);
    expect(headerScore("Response Date/Time", "respondedAt")).toBeGreaterThan(headerScore("Response Date/Time", "reportedAt"));
    expect(headerScore("Foo", "description")).toBe(0);
  });
});

describe("header row detection", () => {
  it("skips title rows", () => {
    const rows = [["DEFECT LOG 2025"], [], ["S/N", "Date", "Location", "Description"], [1, 45721, "L3", "Leak"]];
    expect(detectHeaderRow(rows)).toBe(2);
  });
});

describe("detectColumns on the sample workbook", () => {
  const wb = loadSample();

  it("parses every sheet", () => {
    expect(wb.sheets.map((s) => s.name)).toEqual(["Aircon", "Lighting", "Cleaning", "Toilet", "Security", "Others"]);
  });

  it("auto-detects ≥ 90% of the expected columns", () => {
    const { mapping } = detectColumns(wb.sheets);
    const expected: Record<string, string> = {
      description: "Defect Description",
      location: "Location",
      reportedAt: "Date/Time Reported",
      respondedAt: "Response Date/Time",
      completedAt: "Completion Date/Time",
      status: "Status",
      reportedBy: "Reported By",
      assetOrEquipment: "Equipment",
      actionTaken: "Action Taken",
      originalPriority: "Priority",
    };
    const correct = Object.entries(expected).filter(
      ([field, col]) => mapping[field as keyof typeof mapping].column === col,
    ).length;
    expect(correct / Object.keys(expected).length).toBeGreaterThanOrEqual(0.9);
    expect(mapping.legacyCategory.column).toBeNull();
  });

  it("normalises all sheets with legacy category = sheet name and drops junk rows", () => {
    const { mapping } = detectColumns(wb.sheets);
    const { records, quality } = buildRecords(wb.sheets, mapping);
    expect(records.length).toBe(296);
    for (const r of records) expect(r.legacyCategory).toBe(r.sourceSheet);
    expect(quality.dropped["repeated-header"]).toBe(1);
    expect(quality.dropped["summary-row"]).toBe(1);
    expect(quality.dropped.blank).toBeGreaterThanOrEqual(1);
    expect(quality.exactDuplicates).toBe(2);
    // Every sheet's date format (serial, dd/mm/yyyy, dd-MMM-yy) parses.
    expect(records.filter((r) => !r.reportedAt).length).toBe(0);
    expect(quality.unparseableDates.reportedAt ?? 0).toBe(0);
  });
});

describe("separate date and time columns", () => {
  it("detects a time column and combines it with the date", () => {
    const sheet = sheetFromRows("Log", [
      ["Date Reported", "Time Reported", "Fault Description", "Location"],
      ["05/03/2025", "08:15", "Aircon not cold in office", "L5"],
      ["06/03/2025", "14:30", "Light flickering at corridor", "L2"],
      ["07/03/2025", "09:05", "Toilet choked", "L4 Male Toilet"],
    ]);
    const { mapping } = detectColumns([sheet]);
    expect(mapping.reportedAt).toEqual({ column: "Date Reported", timeColumn: "Time Reported" });
    expect(mapping.description.column).toBe("Fault Description");
    const { records } = buildRecords([sheet], mapping);
    expect(records[0].reportedAt?.toISOString().slice(0, 16)).toBe("2025-03-05T08:15");
  });

  it("falls back to content sniffing when headers are unhelpful", () => {
    const sheet = sheetFromRows("Log", [
      ["Col A", "Col B", "Col C"],
      ["05/03/2025 08:15", "Aircon not cold at the level five open office area", "x"],
      ["06/03/2025 09:00", "Lights flickering in the corridor near the lift lobby", "y"],
    ]);
    const { mapping } = detectColumns([sheet]);
    expect(mapping.reportedAt.column).toBe("Col A");
    expect(mapping.description.column).toBe("Col B");
  });
});
