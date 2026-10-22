import { describe, expect, it } from "vitest";
import {
  combineDateAndTime,
  excelSerialToDate,
  parseDateString,
  parseDateValue,
  parseTimeString,
} from "@/lib/parse/dates";

const iso = (d: Date | undefined) => d?.toISOString().slice(0, 16);

describe("parseDateValue", () => {
  it("parses Excel serial numbers as wall-clock time", () => {
    // 45722.34375 = 2025-03-05 08:15
    expect(iso(excelSerialToDate(45721.34375))).toBe("2025-03-05T08:15");
    expect(iso(parseDateValue(45721.34375))).toBe("2025-03-05T08:15");
  });

  it("defaults to day-first for ambiguous dd/mm/yyyy", () => {
    expect(iso(parseDateString("05/03/2025 08:15"))).toBe("2025-03-05T08:15");
    expect(iso(parseDateString("05/03/2025"))).toBe("2025-03-05T00:00");
  });

  it("supports month-first when requested, and unambiguous dates either way", () => {
    expect(iso(parseDateString("05/03/2025", { dayFirst: false }))).toBe("2025-05-03T00:00");
    expect(iso(parseDateString("25/03/2025 14:00", { dayFirst: false }))).toBe("2025-03-25T14:00");
    expect(iso(parseDateString("03/25/2025"))).toBe("2025-03-25T00:00");
  });

  it("parses ISO dates and ignores time zone designators", () => {
    expect(iso(parseDateString("2025-03-05T08:15:00"))).toBe("2025-03-05T08:15");
    expect(iso(parseDateString("2025-03-05 08:15"))).toBe("2025-03-05T08:15");
    expect(iso(parseDateString("2025-03-05T08:15:00Z"))).toBe("2025-03-05T08:15");
  });

  it("parses dd-MMM-yy hh:mm and other month-name formats", () => {
    expect(iso(parseDateString("05-Mar-25 08:15"))).toBe("2025-03-05T08:15");
    expect(iso(parseDateString("5 March 2025 2:30 PM"))).toBe("2025-03-05T14:30");
    expect(iso(parseDateString("Mar 5, 2025 09:00"))).toBe("2025-03-05T09:00");
  });

  it("handles 12-hour clock edge cases", () => {
    expect(iso(parseDateString("05/03/2025 12:05 am"))).toBe("2025-03-05T00:05");
    expect(iso(parseDateString("05/03/2025 12:05 pm"))).toBe("2025-03-05T12:05");
  });

  it("rejects invalid or implausible dates", () => {
    expect(parseDateString("31/02/2025")).toBeUndefined();
    expect(parseDateString("not a date")).toBeUndefined();
    expect(parseDateValue("")).toBeUndefined();
    expect(parseDateValue(null)).toBeUndefined();
    expect(parseDateValue(0.5)).toBeUndefined(); // time-only fraction
    expect(parseDateString("05/03/1890")).toBeUndefined();
  });

  it("parses numeric strings as Excel serials", () => {
    expect(iso(parseDateValue("45721.5"))).toBe("2025-03-05T12:00");
  });
});

describe("time parsing and combination", () => {
  it("parses time strings", () => {
    expect(parseTimeString("08:15")).toBe((8 * 60 + 15) * 60_000);
    expect(parseTimeString("2:30 pm")).toBe((14 * 60 + 30) * 60_000);
    expect(parseTimeString("0830hrs")).toBe((8 * 60 + 30) * 60_000);
    expect(parseTimeString("25:00")).toBeUndefined();
  });

  it("combines separate date and time columns", () => {
    expect(iso(combineDateAndTime("05/03/2025", "14:45"))).toBe("2025-03-05T14:45");
    expect(iso(combineDateAndTime(45721, 0.25))).toBe("2025-03-05T06:00");
    // Missing time keeps the date.
    expect(iso(combineDateAndTime("05/03/2025", null))).toBe("2025-03-05T00:00");
  });
});
