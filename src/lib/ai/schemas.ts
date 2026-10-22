import "server-only";
import { z } from "zod";
import { CATEGORIES, OPERATIONAL_IMPACTS } from "@/config/categories";
import { CRITICALITY_LEVELS } from "@/config/locations";
import { SYSTEM_FUNCTIONS } from "@/config/systemFunctions";
import type { StrictJsonSchema } from "./client";

// ---------- tiny strict JSON-schema builders (all properties required, no extras) ----------
const str = (description?: string) => ({ type: "string", ...(description ? { description } : {}) });
const nullableStr = (description?: string) => ({ type: ["string", "null"], ...(description ? { description } : {}) });
const num = (description?: string) => ({ type: "number", ...(description ? { description } : {}) });
const enumOf = (values: readonly (string | number)[], type: "string" | "integer" = "string") => ({ type, enum: [...values] });
const arr = (items: object, description?: string) => ({ type: "array", items, ...(description ? { description } : {}) });
function obj(properties: Record<string, object>): StrictJsonSchema {
  return { type: "object", properties, required: Object.keys(properties), additionalProperties: false };
}

// ---------- classification ----------
export const classificationJsonSchema = obj({
  results: arr(
    obj({
      id: str(),
      category: enumOf(CATEGORIES),
      othersSubTheme: nullableStr("Required when category is Others, otherwise null"),
      systemFunction: enumOf(SYSTEM_FUNCTIONS),
      faultType: str("Short normalised label, e.g. 'Water leak from FCU'"),
      normalisedSummary: str("≤ 20 words, standard wording"),
      operationalImpact: enumOf(OPERATIONAL_IMPACTS),
      severity: enumOf([1, 2, 3, 4, 5], "integer"),
      suspectedRootCause: str("≤ 15 words, or 'Insufficient information'"),
      confidence: num("0–1"),
      rationale: str("≤ 25 words"),
    }),
  ),
});

export const classificationValidator = z.object({
  results: z.array(
    z.object({
      id: z.string(),
      category: z.enum(CATEGORIES),
      othersSubTheme: z.string().nullable(),
      systemFunction: z.string(),
      faultType: z.string(),
      normalisedSummary: z.string(),
      operationalImpact: z.enum(OPERATIONAL_IMPACTS),
      severity: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
      suspectedRootCause: z.string(),
      confidence: z.number(),
      rationale: z.string(),
    }),
  ),
});

// ---------- cluster summaries ----------
export const summaryJsonSchema = obj({
  summaries: arr(
    obj({
      clusterId: str(),
      clusterTitle: str("≤ 10 words"),
      consolidatedProblemStatement: str("≤ 50 words"),
      likelyRootCause: str("≤ 25 words"),
      affectedSystemFunction: enumOf(SYSTEM_FUNCTIONS),
      recommendedAction: str("≤ 40 words"),
    }),
  ),
});

export const summaryValidator = z.object({
  summaries: z.array(
    z.object({
      clusterId: z.string(),
      clusterTitle: z.string(),
      consolidatedProblemStatement: z.string(),
      likelyRootCause: z.string(),
      affectedSystemFunction: z.string(),
      recommendedAction: z.string(),
    }),
  ),
});

// ---------- location criticality ----------
export const locationJsonSchema = obj({
  ratings: arr(obj({ location: str(), criticality: enumOf(CRITICALITY_LEVELS), reason: str("≤ 15 words") })),
});

export const locationValidator = z.object({
  ratings: z.array(z.object({ location: z.string(), criticality: z.enum(CRITICALITY_LEVELS), reason: z.string() })),
});

// ---------- change request ----------
export const crJsonSchema = obj({
  title: str("Concise, action-oriented"),
  problemStatement: str("≤ 80 words"),
  operationalImpact: str("Impact type, severity and who/what is affected; ≤ 50 words"),
  suspectedRootCause: str("Hypothesis only; ≤ 40 words"),
  immediateFix: str("Short-term rectification; ≤ 50 words"),
  permanentFix: str("Permanent engineering/maintenance change; ≤ 60 words"),
  acceptanceCriteria: arr(str(), "2–4 measurable criteria"),
  trades: arr(str()),
  estimatedManHours: num("Indicative total man-hours for the permanent fix"),
  effortNotes: str("≤ 30 words"),
});

export const crValidator = z.object({
  title: z.string(),
  problemStatement: z.string(),
  operationalImpact: z.string(),
  suspectedRootCause: z.string(),
  immediateFix: z.string(),
  permanentFix: z.string(),
  acceptanceCriteria: z.array(z.string()),
  trades: z.array(z.string()),
  estimatedManHours: z.number(),
  effortNotes: z.string(),
});

// ---------- insights ----------
export const insightsJsonSchema = obj({ insights: arr(str("One sentence, ≤ 30 words")) });
export const insightsValidator = z.object({ insights: z.array(z.string()) });
