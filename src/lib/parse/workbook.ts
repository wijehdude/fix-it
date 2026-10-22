import * as XLSX from "xlsx";
import type { CellValue, ParsedSheet, ParsedWorkbook } from "@/lib/types";

const HEADER_SCAN_ROWS = 15;

function isEmptyCell(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
}

function isTextCell(v: unknown): boolean {
  return typeof v === "string" && v.trim() !== "" && !/^[\d\s.,:/-]+$/.test(v.trim());
}

/**
 * Finds the header row: the first row (within the first 15) whose count of
 * non-numeric text cells is at least 60% of the best row and ≥ 2.
 * This skips title rows such as "Defect Log — Jan to Jun".
 */
export function detectHeaderRow(rows: unknown[][]): number {
  const scan = rows.slice(0, HEADER_SCAN_ROWS);
  const counts = scan.map((r) => (r ?? []).filter(isTextCell).length);
  const best = Math.max(0, ...counts);
  if (best < 2) return 0;
  const idx = counts.findIndex((c) => c >= Math.max(2, Math.ceil(best * 0.6)));
  return idx < 0 ? 0 : idx;
}

function makeHeaders(raw: unknown[], width: number): string[] {
  const seen = new Map<string, number>();
  const headers: string[] = [];
  for (let i = 0; i < width; i++) {
    const v = raw[i];
    let h = isEmptyCell(v) ? `Column ${i + 1}` : String(v).replace(/\s+/g, " ").trim();
    const n = seen.get(h.toLowerCase()) ?? 0;
    seen.set(h.toLowerCase(), n + 1);
    if (n > 0) h = `${h} (${n + 1})`;
    headers.push(h);
  }
  return headers;
}

function toCell(v: unknown): CellValue {
  if (v === undefined || v === null) return null;
  if (typeof v === "string") return v.trim() === "" ? null : v;
  if (typeof v === "number" || typeof v === "boolean") return v;
  if (v instanceof Date) return v;
  return String(v);
}

/** Converts a SheetJS worksheet (array-of-arrays form) into a ParsedSheet. */
export function sheetFromRows(name: string, rows: unknown[][]): ParsedSheet {
  const headerRowIndex = detectHeaderRow(rows);
  const headerRow = rows[headerRowIndex] ?? [];
  const dataRows = rows.slice(headerRowIndex + 1);
  // Width = last non-empty header column, extended if data has more columns with values.
  let width = 0;
  headerRow.forEach((v, i) => {
    if (!isEmptyCell(v)) width = Math.max(width, i + 1);
  });
  for (const r of dataRows.slice(0, 200)) {
    (r ?? []).forEach((v, i) => {
      if (!isEmptyCell(v)) width = Math.max(width, i + 1);
    });
  }
  const headers = makeHeaders(headerRow, width);
  return {
    name,
    headers,
    headerRowIndex,
    rows: dataRows.map((r) => headers.map((_, i) => toCell((r ?? [])[i]))),
  };
}

/** Parses an .xlsx/.xls/.csv file (in the browser) into sheets. */
export function parseWorkbook(data: ArrayBuffer, fileName: string): ParsedWorkbook {
  const isCsv = /\.csv$/i.test(fileName);
  const wb = XLSX.read(data, {
    type: "array",
    cellDates: false,
    // For CSV, keep text as-is so our day-first date parser handles it (SheetJS assumes US dates).
    raw: isCsv,
    dense: true,
  });
  const sheets: ParsedSheet[] = [];
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      raw: true,
      defval: null,
      blankrows: true,
    });
    if (!rows.some((r) => (r ?? []).some((v) => !isEmptyCell(v)))) continue;
    sheets.push(sheetFromRows(isCsv && wb.SheetNames.length === 1 ? fileName.replace(/\.csv$/i, "") : name, rows));
  }
  return { fileName, sheets };
}
