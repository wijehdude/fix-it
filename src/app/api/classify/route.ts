import { OTHERS_SUB_THEMES } from "@/config/categories";
import { SYSTEM_FUNCTIONS } from "@/config/systemFunctions";
import { callStructured } from "@/lib/ai/client";
import { CLASSIFY_SYSTEM } from "@/lib/ai/prompts";
import { classificationJsonSchema, classificationValidator } from "@/lib/ai/schemas";
import { ClassifyRequest, type ClassifyResponse } from "@/lib/api/contracts";
import { scrubPII } from "@/lib/pii";
import { mockClassify, mockEnabled } from "@/lib/ai/mock";
import { handlePost } from "@/lib/server/http";
import type { Classification } from "@/lib/types";

export const maxDuration = 60;

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export async function POST(req: Request) {
  return handlePost(req, "classify", ClassifyRequest, async ({ records }): Promise<ClassifyResponse> => {
    if (mockEnabled()) return { results: mockClassify(records), missing: [] };
    const input = records.map((r) => ({
      id: r.id,
      description: scrubPII(r.description),
      location: scrubPII(r.location),
      asset: scrubPII(r.asset),
      actionTaken: scrubPII(r.actionTaken),
      legacyCategory: r.legacyCategory,
      ...(r.lockedCategory ? { lockedCategory: r.lockedCategory } : {}),
    }));
    const out = await callStructured({
      name: "classifications",
      system: CLASSIFY_SYSTEM,
      user: `Classify these ${input.length} records:\n${JSON.stringify(input)}`,
      jsonSchema: classificationJsonSchema,
      validator: classificationValidator,
      maxTokens: 12_000,
    });

    const byId = new Map(out.results.map((r) => [r.id, r]));
    const results: Classification[] = [];
    const missing: string[] = [];
    for (const rec of records) {
      const r = byId.get(rec.id);
      if (!r) {
        missing.push(rec.id);
        continue;
      }
      const category = rec.lockedCategory ?? r.category;
      const sub = r.othersSubTheme?.trim();
      results.push({
        id: rec.id,
        category,
        othersSubTheme: category === "Others" ? clip(sub || OTHERS_SUB_THEMES[OTHERS_SUB_THEMES.length - 1], 40) : undefined,
        systemFunction: (SYSTEM_FUNCTIONS as readonly string[]).includes(r.systemFunction) ? r.systemFunction : "Other",
        faultType: clip(r.faultType, 80),
        normalisedSummary: clip(r.normalisedSummary, 200),
        operationalImpact: r.operationalImpact,
        severity: r.severity,
        suspectedRootCause: clip(r.suspectedRootCause, 160),
        confidence: Math.min(1, Math.max(0, r.confidence)),
        rationale: clip(r.rationale, 240),
        categoryLocked: Boolean(rec.lockedCategory),
      });
    }
    return { results, missing };
  });
}
