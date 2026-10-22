/**
 * Strips obvious personal data before anything is sent to OpenAI.
 * Applied in the browser before each request and again on the server (defence in depth).
 */
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// NRIC/FIN-like identifiers: S/T/F/G/M + 7 digits + checksum letter.
const NRIC_RE = /\b[STFGM]\d{7}[A-Z]\b/gi;
// Phone numbers: optional +65 / country code, then 8+ digits possibly split by spaces or dashes.
const PHONE_RE = /(?:\+\d{1,3}[\s-]?)?(?:\(\d{1,4}\)[\s-]?)?\b\d{4}[\s-]?\d{4}\b|\+\d{1,3}[\s-]?\d{2,4}[\s-]?\d{3,4}[\s-]?\d{3,4}\b/g;

export function scrubPII(text: string): string;
export function scrubPII(text: string | undefined): string | undefined;
export function scrubPII(text: string | undefined): string | undefined {
  if (!text) return text;
  return text.replace(EMAIL_RE, "[email]").replace(NRIC_RE, "[id]").replace(PHONE_RE, "[phone]");
}
