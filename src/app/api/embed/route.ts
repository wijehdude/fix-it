import { embedTexts } from "@/lib/ai/client";
import { EmbedRequest, type EmbedResponse } from "@/lib/api/contracts";
import { scrubPII } from "@/lib/pii";
import { mockEmbed, mockEnabled } from "@/lib/ai/mock";
import { handlePost } from "@/lib/server/http";

export const maxDuration = 60;

export async function POST(req: Request) {
  return handlePost(req, "embed", EmbedRequest, async ({ texts }): Promise<EmbedResponse> => {
    if (mockEnabled()) return { embeddings: mockEmbed(texts) };
    const embeddings = await embedTexts(texts.map((t) => scrubPII(t) || "(empty)"));
    return { embeddings };
  });
}
