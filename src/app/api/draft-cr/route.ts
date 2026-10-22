import { callStructured } from "@/lib/ai/client";
import { CR_SYSTEM } from "@/lib/ai/prompts";
import { crJsonSchema, crValidator } from "@/lib/ai/schemas";
import { DraftCrRequest, type DraftCrResponse } from "@/lib/api/contracts";
import { scrubPII } from "@/lib/pii";
import { mockDraftCr, mockEnabled } from "@/lib/ai/mock";
import { handlePost } from "@/lib/server/http";

export const maxDuration = 60;

export async function POST(req: Request) {
  return handlePost(req, "draft-cr", DraftCrRequest, async ({ cluster }): Promise<DraftCrResponse> => {
    if (mockEnabled()) return { cr: mockDraftCr(cluster) };
    const input = {
      ...cluster,
      examples: cluster.examples.map((e) => ({
        ...e,
        description: scrubPII(e.description),
        location: scrubPII(e.location),
        actionTaken: scrubPII(e.actionTaken),
      })),
    };
    const cr = await callStructured({
      name: "change_request",
      system: CR_SYSTEM,
      user: `Draft a change request for this recurring issue:\n${JSON.stringify(input)}`,
      jsonSchema: crJsonSchema,
      validator: crValidator,
    });
    return {
      cr: {
        ...cr,
        acceptanceCriteria: cr.acceptanceCriteria.slice(0, 6),
        trades: cr.trades.slice(0, 6),
        estimatedManHours: Math.max(0, Math.round(cr.estimatedManHours * 10) / 10),
      },
    };
  });
}
