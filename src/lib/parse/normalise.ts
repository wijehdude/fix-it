import { CANONICAL_FIELDS, DATE_FIELDS, type CanonicalField } from "@/config/columnSynonyms";
import { CLUSTERING_CONFIG } from "@/config/scoring";
import { normaliseLocation } from "@/lib/analysis/locations";
import type {
  CellValue,
  DataQualitySummary,
  DefectRecord,
  DroppedRowReason,
  MappingState,
  NormalisedStatus,
  ParsedSheet,
} from "@/lib/types";
import { normaliseHeader } from "./columns";
import { combineDateAndTime, parseDateValue, type DateParseOptions } from "./dates";

export function cleanText(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  if (v instanceof Date) return v.toISOString();
  const s = String(v).replace(/[ \t\r\n]+/g, " ").replace(/\s+/g, " ").trim();
  return s || undefined;
}

/** Lower-cased, punctuation-free text for matching (the original text is kept for display). */
export function matchKey(s: string | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const OPEN_RE = /\b(open|opened|pending|in ?progress|outstanding|new|assigned|wip|on ?hold|ongoing|work in progress|kiv)\b/i;
const CLOSED_RE = /\b(closed|close|completed?|done|resolved|rectified|fixed|cancel+ed|finished|attended and closed)\b/i;

export function normaliseStatus(status: string | undefined, completedAt: Date | undefined): NormalisedStatus {
  if (status) {
    if (CLOSED_RE.test(status)) return "Closed";
    if (OPEN_RE.test(status)) return "Open";
  }
  if (completedAt) return "Closed";
  return status ? "Unknown" : "Open";
}

function isEmpty(v: CellValue | undefined): boolean {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
}

const SUMMARY_RE = /\b(grand\s+)?(sub\s*)?totals?\b/i;

export type BuildOptions = DateParseOptions & { maxRows?: number };

/**
 * Normalises the selected sheets into DefectRecords using the confirmed column mapping.
 * Drops blank rows, repeated header rows, summary/total rows and rows without a description.
 * Flags exact duplicates (same description + location, reportedAt within 10 minutes).
 */
export function buildRecords(
  sheets: ParsedSheet[],
  mapping: MappingState,
  opts: BuildOptions = {},
): { records: DefectRecord[]; quality: DataQualitySummary } {
  const maxRows = opts.maxRows ?? Infinity;
  const dropped: Record<DroppedRowReason, number> = {
    blank: 0,
    "repeated-header": 0,
    "summary-row": 0,
    "missing-description": 0,
  };
  const unparseableDates: Partial<Record<CanonicalField, number>> = {};
  const records: DefectRecord[] = [];
  let rowsRead = 0;
  let truncated = false;

  const mappedColumns = new Set<string>();
  for (const f of CANONICAL_FIELDS) {
    const m = mapping[f];
    if (m.column) mappedColumns.add(m.column);
    if (m.timeColumn) mappedColumns.add(m.timeColumn);
  }
  const mappedFieldCount = CANONICAL_FIELDS.filter((f) => mapping[f].column).length;

  sheets.forEach((sheet, sheetIdx) => {
    const colIndex = new Map(sheet.headers.map((h, i) => [h, i]));
    const get = (row: CellValue[], col: string | null | undefined): CellValue | undefined =>
      col && colIndex.has(col) ? row[colIndex.get(col)!] : undefined;
    const normHeaders = sheet.headers.map(normaliseHeader);

    sheet.rows.forEach((row, rowIdx) => {
      rowsRead++;
      const sourceRow = sheet.headerRowIndex + rowIdx + 2; // 1-based Excel row number
      const nonEmpty = row.filter((v) => !isEmpty(v));
      if (nonEmpty.length === 0) {
        dropped.blank++;
        return;
      }
      // Repeated header: at least half of the non-empty cells equal their column header.
      const headerHits = row.filter((v, i) => !isEmpty(v) && normaliseHeader(String(v)) === normHeaders[i]).length;
      if (headerHits >= Math.max(2, nonEmpty.length / 2)) {
        dropped["repeated-header"]++;
        return;
      }
      const description = cleanText(get(row, mapping.description.column));
      const mappedFilled = CANONICAL_FIELDS.filter((f) => mapping[f].column && !isEmpty(get(row, mapping[f].column))).length;
      const looksLikeSummary =
        (description !== undefined && description.length < 40 && SUMMARY_RE.test(description)) ||
        nonEmpty.some((v) => typeof v === "string" && /^\s*(grand\s+)?totals?\s*:?\s*$/i.test(v)) ||
        (mappedFieldCount >= 3 && mappedFilled / mappedFieldCount < 0.3 && !description);
      if (looksLikeSummary) {
        dropped["summary-row"]++;
        return;
      }
      if (!description) {
        dropped["missing-description"]++;
        return;
      }
      if (records.length >= maxRows) {
        truncated = true;
        return;
      }

      const dates: Partial<Record<CanonicalField, Date | undefined>> = {};
      for (const f of DATE_FIELDS) {
        const m = mapping[f];
        const raw = get(row, m.column);
        if (isEmpty(raw)) continue;
        const d = m.timeColumn ? combineDateAndTime(raw, get(row, m.timeColumn), opts) : parseDateValue(raw, opts);
        if (!d) unparseableDates[f] = (unparseableDates[f] ?? 0) + 1;
        dates[f] = d;
      }

      const extra: Record<string, unknown> = {};
      sheet.headers.forEach((h, i) => {
        if (mappedColumns.has(h) || isEmpty(row[i])) return;
        extra[h] = row[i] instanceof Date ? (row[i] as Date).toISOString() : row[i];
      });

      const status = cleanText(get(row, mapping.status.column));
      const location = cleanText(get(row, mapping.location.column));
      records.push({
        id: `s${sheetIdx + 1}r${sourceRow}`,
        sourceSheet: sheet.name,
        sourceRow,
        legacyCategory: cleanText(get(row, mapping.legacyCategory.column)) ?? sheet.name,
        description,
        location,
        normalisedLocation: normaliseLocation(location),
        reportedAt: dates.reportedAt,
        respondedAt: dates.respondedAt,
        completedAt: dates.completedAt,
        status,
        statusNormalised: normaliseStatus(status, dates.completedAt),
        reportedBy: cleanText(get(row, mapping.reportedBy.column)),
        assetOrEquipment: cleanText(get(row, mapping.assetOrEquipment.column)),
        actionTaken: cleanText(get(row, mapping.actionTaken.column)),
        originalPriority: cleanText(get(row, mapping.originalPriority.column)),
        extra,
        isDuplicate: false,
      });
    });
  });

  const exactDuplicates = flagDuplicates(records);

  const missingPct: Partial<Record<CanonicalField, number>> = {};
  const fieldValue = (r: DefectRecord, f: CanonicalField): unknown => (r as unknown as Record<string, unknown>)[f];
  for (const f of CANONICAL_FIELDS) {
    if (f === "legacyCategory") continue;
    const missing = records.filter((r) => fieldValue(r, f) === undefined || fieldValue(r, f) === "").length;
    missingPct[f] = records.length ? (missing / records.length) * 100 : 0;
  }

  return {
    records,
    quality: {
      rowsRead,
      rowsKept: records.length,
      dropped,
      missingPct,
      exactDuplicates,
      unparseableDates,
      truncated,
    },
  };
}

/** Marks exact duplicates in place. Returns the number of duplicates found. */
export function flagDuplicates(records: DefectRecord[]): number {
  const windowMs = CLUSTERING_CONFIG.duplicateWindowMinutes * 60_000;
  const groups = new Map<string, DefectRecord[]>();
  for (const r of records) {
    if (!r.reportedAt) continue;
    const key = `${matchKey(r.description)}|${r.normalisedLocation ?? ""}`;
    const arr = groups.get(key) ?? [];
    arr.push(r);
    groups.set(key, arr);
  }
  let count = 0;
  for (const arr of groups.values()) {
    if (arr.length < 2) continue;
    arr.sort((a, b) => a.reportedAt!.getTime() - b.reportedAt!.getTime());
    let anchor = arr[0];
    for (let i = 1; i < arr.length; i++) {
      const r = arr[i];
      if (r.reportedAt!.getTime() - anchor.reportedAt!.getTime() <= windowMs) {
        r.isDuplicate = true;
        r.duplicateOf = anchor.id;
        count++;
      } else {
        anchor = r;
      }
    }
  }
  return count;
}
