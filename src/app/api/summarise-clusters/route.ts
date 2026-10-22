import { SYSTEM_FUNCTIONS } from "@/config/systemFunctions";
import { callStructured } from "@/lib/ai/client";
import { SUMMARISE_SYSTEM } from "@/lib/ai/prompts";
import { summaryJsonSchema, summaryValidator } from "@/lib/ai/schemas";
import { SummariseRequest, type SummariseResponse } from "@/lib/api/contracts";
import { scrubPII } from "@/lib/pii";
import { mockEnabled, mockSummarise } from "@/lib/ai/mock";
import { handlePost } from "@/lib/server/http";

export const maxDuration = 60;

export async function POST(req: Request) {
  return handlePost(req, "summarise-clusters", SummariseRequest, async ({ clusters }): Promise<SummariseResponse> => {
    if (mockEnabled()) return { summaries: mockSummarise(clusters) };
    const input = clusters.map((c) => ({
      clusterId: c.clusterId,
      category: c.category,
      reports: c.examples.map((e) => ({
        description: scrubPII(e.description),
        location: scrubPII(e.location),
        faultType: e.faultType,
        actionTaken: scrubPII(e.actionTaken),
      })),
    }));
    const out = await callStructured({
      name: "cluster_summaries",
      system: SUMMARISE_SYSTEM,
      user: `Summarise these ${input.length} clusters:\n${JSON.stringify(input)}`,
      jsonSchema: summaryJsonSchema,
      validator: summaryValidator,
    });
    const wanted = new Set(clusters.map((c) => c.clusterId));
    return {
      summaries: out.summaries
        .filter((s) => wanted.has(s.clusterId))
        .map((s) => ({
          ...s,
          affectedSystemFunction: (SYSTEM_FUNCTIONS as readonly string[]).includes(s.affectedSystemFunction)
            ? s.affectedSystemFunction
            : "Other",
        })),
    };
  });
}
