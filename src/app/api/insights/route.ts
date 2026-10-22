import { callStructured } from "@/lib/ai/client";
import { INSIGHTS_SYSTEM } from "@/lib/ai/prompts";
import { insightsJsonSchema, insightsValidator } from "@/lib/ai/schemas";
import { InsightsRequest, type InsightsResponse } from "@/lib/api/contracts";
import { mockEnabled, mockInsights } from "@/lib/ai/mock";
import { handlePost } from "@/lib/server/http";

export const maxDuration = 60;

export async function POST(req: Request) {
  return handlePost(
    req,
    "insights",
    InsightsRequest,
    async ({ stats }): Promise<InsightsResponse> => {
      if (mockEnabled()) return { insights: mockInsights(stats) };
      const out = await callStructured({
        name: "insights",
        system: INSIGHTS_SYSTEM,
        user: `Aggregate statistics:\n${JSON.stringify(stats)}`,
        jsonSchema: insightsJsonSchema,
        validator: insightsValidator,
        maxTokens: 3000,
      });
      return { insights: out.insights.slice(0, 5) };
    },
    32 * 1024,
  );
}
