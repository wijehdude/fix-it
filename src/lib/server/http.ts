import "server-only";
import type { z } from "zod";
import { API_LIMITS, type ApiErrorBody, type ApiErrorCode } from "@/lib/api/contracts";
import { AiError } from "@/lib/ai/client";
import { checkRateLimit, clientIp } from "./rateLimit";

const STATUS: Record<ApiErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  PAYLOAD_TOO_LARGE: 413,
  RATE_LIMITED: 429,
  UPSTREAM_RATE_LIMITED: 429,
  NOT_CONFIGURED: 503,
  UPSTREAM_ERROR: 502,
  INVALID_AI_RESPONSE: 502,
  INTERNAL: 500,
};

export function errorResponse(code: ApiErrorCode, message: string, headers?: HeadersInit): Response {
  const body: ApiErrorBody = { error: { code, message } };
  return Response.json(body, { status: STATUS[code], headers: { "Cache-Control": "no-store", ...headers } });
}

/** True when the ACCESS_CODE gate is disabled or the request carries the right code. */
export function accessAllowed(req: Request): boolean {
  const code = process.env.ACCESS_CODE;
  if (!code) return true;
  const given = req.headers.get("x-access-code") ?? "";
  // Constant-time-ish comparison.
  if (given.length !== code.length) return false;
  let diff = 0;
  for (let i = 0; i < code.length; i++) diff |= given.charCodeAt(i) ^ code.charCodeAt(i);
  return diff === 0;
}

/**
 * Wraps a stateless POST route: access code → rate limit → size limit (413) → JSON + Zod
 * validation → handler → typed errors. Request bodies are never logged.
 */
export async function handlePost<S extends z.ZodType, R>(
  req: Request,
  route: string,
  schema: S,
  handler: (body: z.infer<S>) => Promise<R>,
  maxBytes = API_LIMITS.maxBodyBytes,
): Promise<Response> {
  if (!accessAllowed(req)) return errorResponse("UNAUTHORIZED", "Access code required or incorrect.");

  const rl = checkRateLimit(clientIp(req));
  if (!rl.ok) {
    return errorResponse("RATE_LIMITED", "Too many requests. Please slow down.", {
      "Retry-After": String(rl.retryAfterSec),
    });
  }

  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > maxBytes) return errorResponse("PAYLOAD_TOO_LARGE", `Request body exceeds ${maxBytes} bytes.`);
  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return errorResponse("BAD_REQUEST", "Could not read request body.");
  }
  if (new TextEncoder().encode(raw).length > maxBytes) {
    return errorResponse("PAYLOAD_TOO_LARGE", `Request body exceeds ${maxBytes} bytes.`);
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return errorResponse("BAD_REQUEST", "Body must be valid JSON.");
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return errorResponse("BAD_REQUEST", `Invalid request: ${issue?.path.join(".") || "body"} — ${issue?.message ?? "invalid"}`);
  }

  try {
    const result = await handler(parsed.data);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof AiError) {
      // Log only the route, code and upstream status — never request or response content.
      console.error(`[${route}] ${err.code}${err.status ? ` (upstream ${err.status})` : ""}`);
      return errorResponse(err.code, err.publicMessage);
    }
    console.error(`[${route}] INTERNAL ${err instanceof Error ? err.name : "unknown"}`);
    return errorResponse("INTERNAL", "Unexpected server error.");
  }
}
