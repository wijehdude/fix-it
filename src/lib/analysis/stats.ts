/** Linear-interpolated percentile (p in 0–1). Returns undefined for an empty array. */
export function percentile(values: number[], p: number): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * Math.min(1, Math.max(0, p));
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function median(values: number[]): number | undefined {
  return percentile(values, 0.5);
}

export function mean(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function round(v: number, dp = 1): number {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
}

/** Formats a share as a percentage, or "n/a" when the denominator is zero. */
export function pct(numerator: number, denominator: number, dp = 0): string {
  if (!denominator) return "n/a";
  return `${round((numerator / denominator) * 100, dp)}%`;
}
