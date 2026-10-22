import {
  CANONICAL_FIELDS,
  COLUMN_SYNONYMS,
  DATE_FIELDS,
  TIME_ONLY_HINTS,
  type CanonicalField,
} from "@/config/columnSynonyms";
import type { CellValue, DetectionConfidence, FieldDetection, MappingState, ParsedSheet } from "@/lib/types";
import { looksLikeTimeOnly, parseDateValue } from "./dates";

export function normaliseHeader(h: string): string {
  return h
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function containsPhrase(header: string, phrase: string): boolean {
  return ` ${header} `.includes(` ${phrase} `);
}

/** Header-only score of a column for a field, 0–1. */
export function headerScore(header: string, field: CanonicalField): number {
  const h = normaliseHeader(header);
  if (!h) return 0;
  const { strong, weak } = COLUMN_SYNONYMS[field];
  let best = 0;
  for (const raw of strong) {
    const s = normaliseHeader(raw);
    if (h === s) best = Math.max(best, 1);
    else if (containsPhrase(h, s)) best = Math.max(best, 0.8 + 0.15 * (s.length / h.length));
  }
  for (const raw of weak) {
    const s = normaliseHeader(raw);
    if (h === s) best = Math.max(best, 0.6);
    else if (containsPhrase(h, s)) best = Math.max(best, 0.4 + 0.1 * (s.length / h.length));
  }
  return Math.min(1, best);
}

export type ColumnProfile = {
  header: string;
  nonEmpty: number;
  /** Share of non-empty values that parse as a full date. */
  dateShare: number;
  /** Share of non-empty values that look like a time of day only. */
  timeShare: number;
  avgTextLength: number;
  textShare: number;
  samples: CellValue[];
};

/** Profiles every column across the given sheets using up to `sampleSize` rows per sheet. */
export function profileColumns(sheets: ParsedSheet[], sampleSize = 60): Map<string, ColumnProfile> {
  const values = new Map<string, CellValue[]>();
  for (const sheet of sheets) {
    sheet.headers.forEach((h, i) => {
      const arr = values.get(h) ?? [];
      for (const row of sheet.rows.slice(0, sampleSize)) {
        const v = row[i];
        if (v !== null && v !== undefined && v !== "") arr.push(v);
      }
      values.set(h, arr);
    });
  }
  const profiles = new Map<string, ColumnProfile>();
  for (const [header, vals] of values) {
    const n = vals.length;
    let dates = 0;
    let times = 0;
    let textLen = 0;
    let texts = 0;
    for (const v of vals) {
      if (looksLikeTimeOnly(v)) times++;
      else if (parseDateValue(v)) dates++;
      if (typeof v === "string" && !/^[\d\s.,:/-]+$/.test(v)) {
        texts++;
        textLen += v.length;
      }
    }
    profiles.set(header, {
      header,
      nonEmpty: n,
      dateShare: n ? dates / n : 0,
      timeShare: n ? times / n : 0,
      avgTextLength: texts ? textLen / texts : 0,
      textShare: n ? texts / n : 0,
      samples: vals.slice(0, 3),
    });
  }
  return profiles;
}

/** Combined header + content score. */
function fieldScore(field: CanonicalField, profile: ColumnProfile): number {
  let score = headerScore(profile.header, field);
  const isDateField = DATE_FIELDS.includes(field);
  if (profile.nonEmpty > 0) {
    if (isDateField && score > 0 && profile.dateShare < 0.3) score *= 0.3;
    if (!isDateField && profile.dateShare > 0.8) score *= 0.3;
    if (field === "description" && profile.textShare < 0.5) score *= 0.4;
  }
  return score;
}

function toConfidence(score: number): DetectionConfidence {
  if (score >= 0.85) return "high";
  if (score >= 0.55) return "medium";
  if (score > 0) return "low";
  return "none";
}

export function emptyMapping(): MappingState {
  return Object.fromEntries(CANONICAL_FIELDS.map((f) => [f, { column: null }])) as MappingState;
}

/**
 * Auto-detects a column for each canonical field.
 * 1. Header matching against the synonym dictionary (greedy, highest score first, one column per field).
 * 2. Content sniffing as a tiebreaker / fallback: date-like columns fill unmapped date fields,
 *    and the longest-average-text column becomes the description.
 * 3. Separate time columns are attached to date fields when the header shares a synonym.
 */
export function detectColumns(sheets: ParsedSheet[]): { mapping: MappingState; detections: FieldDetection[] } {
  const profiles = profileColumns(sheets);
  const headers = [...profiles.keys()];
  const mapping = emptyMapping();
  const detections = new Map<CanonicalField, FieldDetection>();
  const used = new Set<string>();

  type Candidate = { field: CanonicalField; header: string; score: number };
  const candidates: Candidate[] = [];
  for (const field of CANONICAL_FIELDS) {
    for (const header of headers) {
      const p = profiles.get(header)!;
      const score = fieldScore(field, p);
      if (score > 0) candidates.push({ field, header, score });
    }
  }
  // Highest score first; tie-break on content fit (more dates for date fields, longer text for description).
  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const pa = profiles.get(a.header)!;
    const pb = profiles.get(b.header)!;
    if (DATE_FIELDS.includes(a.field)) return pb.dateShare - pa.dateShare;
    if (a.field === "description") return pb.avgTextLength - pa.avgTextLength;
    return headers.indexOf(a.header) - headers.indexOf(b.header);
  });
  for (const c of candidates) {
    if (mapping[c.field].column || used.has(c.header) || c.score < 0.4) continue;
    mapping[c.field] = { column: c.header };
    used.add(c.header);
    detections.set(c.field, {
      field: c.field,
      column: c.header,
      score: c.score,
      confidence: toConfidence(c.score),
      reason: "Header matches synonym list",
    });
  }

  // Content sniffing: unmapped date fields take remaining date-like columns, in column order.
  for (const field of DATE_FIELDS) {
    if (mapping[field].column) continue;
    const header = headers.find((h) => !used.has(h) && profiles.get(h)!.dateShare >= 0.8);
    if (header) {
      mapping[field] = { column: header };
      used.add(header);
      detections.set(field, { field, column: header, score: 0.4, confidence: "low", reason: "Column contains dates" });
    }
  }
  // Content sniffing: description = longest average text among unused columns.
  if (!mapping.description.column) {
    const header = headers
      .filter((h) => !used.has(h) && profiles.get(h)!.textShare >= 0.5)
      .sort((a, b) => profiles.get(b)!.avgTextLength - profiles.get(a)!.avgTextLength)[0];
    if (header) {
      mapping.description = { column: header };
      used.add(header);
      detections.set("description", {
        field: "description",
        column: header,
        score: 0.4,
        confidence: "low",
        reason: "Longest free-text column",
      });
    }
  }

  // Separate time columns: e.g. "Date Reported" + "Time Reported".
  for (const field of DATE_FIELDS) {
    const col = mapping[field].column;
    if (!col) continue;
    const timeHeader = headers.find((h) => {
      if (used.has(h)) return false;
      const p = profiles.get(h)!;
      const nh = normaliseHeader(h);
      const isTimeHeader = TIME_ONLY_HINTS.some((t) => containsPhrase(nh, t));
      return isTimeHeader && p.timeShare >= 0.6 && headerScore(h, field) >= 0.8;
    });
    if (timeHeader) {
      mapping[field] = { column: col, timeColumn: timeHeader };
      used.add(timeHeader);
    }
  }

  const all: FieldDetection[] = CANONICAL_FIELDS.map(
    (field) =>
      detections.get(field) ?? { field, column: null, score: 0, confidence: "none", reason: "No matching column" },
  );
  return { mapping, detections: all };
}

/** Union of headers across sheets, preserving first-seen order. */
export function unionHeaders(sheets: ParsedSheet[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of sheets) {
    for (const h of s.headers) {
      if (seen.has(h)) continue;
      seen.add(h);
      out.push(h);
    }
  }
  return out;
}
