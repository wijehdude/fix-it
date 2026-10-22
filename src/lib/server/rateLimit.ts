import "server-only";

/**
 * In-memory sliding-window rate limiter, per IP, per serverless instance.
 * Good enough for v1 abuse mitigation (see README for the OpenAI monthly spend limit).
 */
const WINDOW_MS = 60_000;
const hits = new Map<string, number[]>();
let lastSweep = Date.now();

export function rateLimitPerMinute(): number {
  const n = Number(process.env.RATE_LIMIT_PER_MIN);
  return Number.isFinite(n) && n > 0 ? n : 120;
}

export function checkRateLimit(key: string, limit = rateLimitPerMinute()): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  if (now - lastSweep > WINDOW_MS * 5) {
    for (const [k, arr] of hits) if (!arr.length || now - arr[arr.length - 1] > WINDOW_MS) hits.delete(k);
    lastSweep = now;
  }
  const arr = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (arr.length >= limit) {
    hits.set(key, arr);
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((WINDOW_MS - (now - arr[0])) / 1000)) };
  }
  arr.push(now);
  hits.set(key, arr);
  return { ok: true, retryAfterSec: 0 };
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
