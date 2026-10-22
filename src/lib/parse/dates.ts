/**
 * Robust date parsing for defect logs.
 *
 * All dates are treated as local wall-clock time and stored as UTC instants
 * (e.g. "05/03/2025 08:15" → 2025-03-05T08:15:00Z). Every consumer reads them
 * with getUTC* so results do not depend on the browser's time zone.
 */

const MS_PER_DAY = 86_400_000;
const EXCEL_EPOCH_OFFSET_DAYS = 25569; // days between 1899-12-30 and 1970-01-01

const MONTHS: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8,
  september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};

export type DateParseOptions = { dayFirst?: boolean };

const MIN_YEAR = 1990;
const MAX_YEAR = 2100;

function makeDate(y: number, m: number, d: number, h = 0, mi = 0, s = 0): Date | undefined {
  if (m < 0 || m > 11 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return undefined;
  if (y < MIN_YEAR || y > MAX_YEAR) return undefined;
  const date = new Date(Date.UTC(y, m, d, h, mi, s));
  // Reject roll-overs such as 31/02.
  if (date.getUTCMonth() !== m || date.getUTCDate() !== d) return undefined;
  return date;
}

function expandYear(y: number): number {
  if (y >= 100) return y;
  return y < 70 ? 2000 + y : 1900 + y;
}

/** Converts an Excel serial date number to a wall-clock UTC Date. */
export function excelSerialToDate(serial: number): Date | undefined {
  if (!Number.isFinite(serial) || serial < 1 || serial > 2_958_465) return undefined;
  const ms = Math.round((serial - EXCEL_EPOCH_OFFSET_DAYS) * 86_400) * 1000;
  const date = new Date(ms);
  const y = date.getUTCFullYear();
  if (y < MIN_YEAR || y > MAX_YEAR) return undefined;
  return date;
}

const TIME_RE = /^(\d{1,2})(?:[:.](\d{2}))(?:[:.](\d{2}))?(?:\.\d+)?\s*(am|pm|a\.m\.|p\.m\.)?$/i;
const COMPACT_TIME_RE = /^(\d{2})(\d{2})\s*(?:h|hr|hrs|hours)$/i;
const HOUR_AMPM_RE = /^(\d{1,2})\s*(am|pm)$/i;

/** Parses a time-of-day string. Returns milliseconds since midnight, or undefined. */
export function parseTimeString(input: string): number | undefined {
  const s = input.trim().toLowerCase();
  if (!s) return undefined;
  let h: number;
  let mi = 0;
  let sec = 0;
  let ampm: string | undefined;
  let m = TIME_RE.exec(s);
  if (m) {
    h = Number(m[1]);
    mi = Number(m[2]);
    sec = m[3] ? Number(m[3]) : 0;
    ampm = m[4];
  } else if ((m = COMPACT_TIME_RE.exec(s))) {
    h = Number(m[1]);
    mi = Number(m[2]);
  } else if ((m = HOUR_AMPM_RE.exec(s))) {
    h = Number(m[1]);
    ampm = m[2];
  } else {
    return undefined;
  }
  if (ampm) {
    if (h < 1 || h > 12) return undefined;
    const pm = ampm.startsWith("p");
    if (h === 12) h = pm ? 12 : 0;
    else if (pm) h += 12;
  }
  if (h > 23 || mi > 59 || sec > 59) return undefined;
  return ((h * 60 + mi) * 60 + sec) * 1000;
}

/** Parses a time-only cell (Excel day fraction, Date or string). Returns ms since midnight. */
export function parseTimeValue(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  if (typeof value === "number") {
    if (value >= 0 && value < 1) return Math.round(value * 86_400) * 1000;
    // A full serial date-time: take the time part.
    if (value >= 1) return Math.round((value % 1) * 86_400) * 1000;
    return undefined;
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return undefined;
    return ((value.getHours() * 60 + value.getMinutes()) * 60 + value.getSeconds()) * 1000;
  }
  return parseTimeString(String(value));
}

function applyTime(date: Date | undefined, timePart: string | undefined): Date | undefined {
  if (!date) return undefined;
  if (!timePart || !timePart.trim()) return date;
  const t = parseTimeString(timePart);
  if (t === undefined) return undefined;
  return new Date(date.getTime() + t);
}

const ISO_RE =
  /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s]+(\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:\s*[ap]\.?m\.?)?))?\s*(?:z|[+-]\d{2}:?\d{2})?$/i;
const NUMERIC_RE = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?:[T\s,]+(.+))?$/;
const DAY_MONTHNAME_RE = /^(\d{1,2})(?:st|nd|rd|th)?[\s\-/]+([a-z]{3,9})\.?[\s\-/,]+(\d{2,4})(?:[T\s,]+(.+))?$/i;
const MONTHNAME_DAY_RE = /^([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{2,4})(?:[T\s,]+(.+))?$/i;

/** Parses a date string. Defaults to day-first (Singapore convention) for ambiguous numeric dates. */
export function parseDateString(input: string, opts: DateParseOptions = {}): Date | undefined {
  const dayFirst = opts.dayFirst ?? true;
  const s = input.trim().replace(/\s+/g, " ");
  if (!s) return undefined;

  let m = ISO_RE.exec(s);
  if (m) {
    // Time zone designators are ignored: values are treated as local wall-clock time.
    return applyTime(makeDate(Number(m[1]), Number(m[2]) - 1, Number(m[3])), m[4]);
  }

  m = NUMERIC_RE.exec(s);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const y = expandYear(Number(m[3]));
    let day: number;
    let month: number;
    if (a > 12 && b <= 12) {
      day = a;
      month = b;
    } else if (b > 12 && a <= 12) {
      day = b;
      month = a;
    } else if (dayFirst) {
      day = a;
      month = b;
    } else {
      day = b;
      month = a;
    }
    return applyTime(makeDate(y, month - 1, day), m[4]);
  }

  m = DAY_MONTHNAME_RE.exec(s);
  if (m) {
    const month = MONTHS[m[2].toLowerCase()];
    if (month === undefined) return undefined;
    return applyTime(makeDate(expandYear(Number(m[3])), month, Number(m[1])), m[4]);
  }

  m = MONTHNAME_DAY_RE.exec(s);
  if (m) {
    const month = MONTHS[m[1].toLowerCase()];
    if (month === undefined) return undefined;
    return applyTime(makeDate(expandYear(Number(m[3])), month, Number(m[2])), m[4]);
  }

  return undefined;
}

/** Parses any cell value (Excel serial, Date, string) into a wall-clock UTC Date. */
export function parseDateValue(value: unknown, opts: DateParseOptions = {}): Date | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return undefined;
    return makeDate(
      value.getFullYear(),
      value.getMonth(),
      value.getDate(),
      value.getHours(),
      value.getMinutes(),
      value.getSeconds(),
    );
  }
  if (typeof value === "number") return excelSerialToDate(value);
  if (typeof value === "string") {
    const trimmed = value.trim();
    // A purely numeric string may be an Excel serial exported as text.
    if (/^\d{5}(\.\d+)?$/.test(trimmed)) return excelSerialToDate(Number(trimmed));
    return parseDateString(trimmed, opts);
  }
  return undefined;
}

/** Combines a date cell with a separate time cell. The time cell replaces the date's time part. */
export function combineDateAndTime(
  dateValue: unknown,
  timeValue: unknown,
  opts: DateParseOptions = {},
): Date | undefined {
  const date = parseDateValue(dateValue, opts);
  if (!date) return undefined;
  const t = parseTimeValue(timeValue);
  if (t === undefined) return date;
  const midnight = Math.floor(date.getTime() / MS_PER_DAY) * MS_PER_DAY;
  return new Date(midnight + t);
}

/** True when the value looks like a time-of-day only (Excel fraction or "hh:mm"). */
export function looksLikeTimeOnly(value: unknown): boolean {
  if (typeof value === "number") return value >= 0 && value < 1;
  if (typeof value === "string") return parseTimeString(value) !== undefined;
  return false;
}

const pad = (n: number) => String(n).padStart(2, "0");
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Formats a wall-clock UTC Date as "05 Mar 2025 08:15". */
export function formatDateTime(d: Date | undefined): string {
  if (!d) return "n/a";
  return `${pad(d.getUTCDate())} ${MONTH_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** Formats a wall-clock UTC Date as "05 Mar 2025". */
export function formatDate(d: Date | undefined): string {
  if (!d) return "n/a";
  return `${pad(d.getUTCDate())} ${MONTH_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "2025-03" month key. */
export function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

export function formatMonthKey(key: string): string {
  const [y, m] = key.split("-");
  return `${MONTH_SHORT[Number(m) - 1]} ${y.slice(2)}`;
}

/** yyyy-mm-dd for <input type="date">. */
export function toDateInputValue(d: Date | undefined): string {
  if (!d) return "";
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function fromDateInputValue(s: string): Date | undefined {
  if (!s) return undefined;
  const [y, m, d] = s.split("-").map(Number);
  return makeDate(y, m - 1, d);
}

/** The current local wall-clock time as a UTC instant (for "reference date = now"). */
export function nowAsWallClock(): Date {
  const n = new Date();
  return new Date(
    Date.UTC(n.getFullYear(), n.getMonth(), n.getDate(), n.getHours(), n.getMinutes(), n.getSeconds()),
  );
}

export const HOUR_MS = 3_600_000;
export const DAY_MS = MS_PER_DAY;
