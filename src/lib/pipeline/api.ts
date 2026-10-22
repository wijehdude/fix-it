"use client";

import { PIPELINE_CONFIG } from "@/config/limits";
import type { ApiErrorBody, ApiErrorCode } from "@/lib/api/contracts";
import { useAnalysisStore } from "@/store/useAnalysisStore";

export class ApiClientError extends Error {
  constructor(
    public code: ApiErrorCode | "NETWORK" | "ABORTED",
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new ApiClientError("ABORTED", "Cancelled"));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new ApiClientError("ABORTED", "Cancelled"));
      },
      { once: true },
    );
  });

function headers(): HeadersInit {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  const code = useAnalysisStore.getState().accessCode;
  if (code) h["x-access-code"] = code;
  return h;
}

/**
 * POSTs JSON to an API route with retries and exponential backoff on 429 / 5xx / network errors.
 * 429s (from our limiter or OpenAI) are retried more patiently and honour Retry-After.
 */
export async function apiPost<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  let attempt = 0;
  let rateLimitAttempts = 0;
  for (;;) {
    if (signal?.aborted) throw new ApiClientError("ABORTED", "Cancelled");
    let res: Response;
    try {
      res = await fetch(path, { method: "POST", headers: headers(), body: JSON.stringify(body), signal });
    } catch (err) {
      if (signal?.aborted || (err instanceof DOMException && err.name === "AbortError")) {
        throw new ApiClientError("ABORTED", "Cancelled");
      }
      if (attempt++ >= PIPELINE_CONFIG.maxRetries) throw new ApiClientError("NETWORK", "Network error — check your connection.");
      await sleep(PIPELINE_CONFIG.baseBackoffMs * 2 ** attempt * (0.75 + Math.random() * 0.5), signal);
      continue;
    }
    if (res.ok) return (await res.json()) as T;

    let err: ApiErrorBody["error"] = { code: "INTERNAL", message: `HTTP ${res.status}` };
    try {
      err = ((await res.json()) as ApiErrorBody).error ?? err;
    } catch {
      /* non-JSON error */
    }
    if (res.status === 429) {
      if (rateLimitAttempts++ >= PIPELINE_CONFIG.maxRateLimitRetries) throw new ApiClientError(err.code, err.message, 429);
      const retryAfter = Number(res.headers.get("Retry-After"));
      const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : PIPELINE_CONFIG.baseBackoffMs * 2 ** Math.min(rateLimitAttempts, 5);
      await sleep(wait * (0.9 + Math.random() * 0.2), signal);
      continue;
    }
    const retryable = res.status >= 500 && err.code !== "NOT_CONFIGURED";
    if (!retryable || attempt++ >= PIPELINE_CONFIG.maxRetries) throw new ApiClientError(err.code, err.message, res.status);
    await sleep(PIPELINE_CONFIG.baseBackoffMs * 2 ** attempt * (0.75 + Math.random() * 0.5), signal);
  }
}

/** Runs `fn` over items with a concurrency limit. Errors are collected, not thrown (except abort). */
export async function runPool<T>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<void>,
  signal?: AbortSignal,
): Promise<{ failed: { item: T; error: unknown }[] }> {
  const failed: { item: T; error: unknown }[] = [];
  let next = 0;
  async function worker() {
    while (next < items.length) {
      if (signal?.aborted) return;
      const i = next++;
      try {
        await fn(items[i], i);
      } catch (error) {
        if (error instanceof ApiClientError && error.code === "ABORTED") return;
        failed.push({ item: items[i], error });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  if (signal?.aborted) throw new ApiClientError("ABORTED", "Cancelled");
  return { failed };
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiClientError) return err.message;
  if (err instanceof Error) return err.message;
  return "Unknown error";
}
