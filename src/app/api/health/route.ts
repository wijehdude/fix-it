import { aiConfigured, chatModel } from "@/lib/ai/client";
import type { HealthResponse } from "@/lib/api/contracts";
import { mockEnabled } from "@/lib/ai/mock";
import { accessAllowed } from "@/lib/server/http";
import { checkRateLimit, clientIp } from "@/lib/server/rateLimit";
import { errorResponse } from "@/lib/server/http";

/** Lets the UI know whether the AI is configured and whether an access code is required / correct. */
export async function GET(req: Request) {
  if (!checkRateLimit(`health:${clientIp(req)}`, 30).ok) return errorResponse("RATE_LIMITED", "Too many requests.");
  const body: HealthResponse = {
    ok: true,
    aiConfigured: aiConfigured() || mockEnabled(),
    mock: mockEnabled(),
    accessCodeRequired: Boolean(process.env.ACCESS_CODE),
    accessOk: accessAllowed(req),
    model: chatModel(),
  };
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}
