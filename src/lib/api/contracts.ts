/**
 * Request/response contracts shared by the browser pipeline and the API routes.
 * Request bodies are validated with Zod on the server.
 */
import { z } from "zod";
import { CATEGORIES } from "@/config/categories";
import type { ChangeRequestAI, Classification, ClusterSummary, Criticality } from "@/lib/types";

const text = (max: number) => z.string().max(max);
const optText = (max: number) => z.string().max(max).optional();

export const API_LIMITS = {
  classifyBatch: 25,
  embedBatch: 100,
  summariseClusters: 10,
  summariseExamples: 8,
  locations: 200,
  crExamples: 10,
  /** Max request body size in bytes. */
  maxBodyBytes: 256 * 1024,
};

// ---------- /api/classify ----------
export const ClassifyRequest = z.object({
  records: z
    .array(
      z.object({
        id: text(64),
        description: text(2000),
        location: optText(300),
        asset: optText(300),
        actionTaken: optText(1000),
        legacyCategory: text(120),
        lockedCategory: z.enum(CATEGORIES).nullable().optional(),
      }),
    )
    .min(1)
    .max(API_LIMITS.classifyBatch),
});
export type ClassifyRequest = z.infer<typeof ClassifyRequest>;
export type ClassifyResponse = { results: Classification[]; missing: string[] };

// ---------- /api/embed ----------
export const EmbedRequest = z.object({
  texts: z.array(text(1000)).min(1).max(API_LIMITS.embedBatch),
});
export type EmbedRequest = z.infer<typeof EmbedRequest>;
export type EmbedResponse = { embeddings: number[][] };

// ---------- /api/summarise-clusters ----------
export const SummariseRequest = z.object({
  clusters: z
    .array(
      z.object({
        clusterId: text(64),
        category: z.enum(CATEGORIES),
        examples: z
          .array(
            z.object({
              description: text(2000),
              location: optText(300),
              faultType: optText(200),
              actionTaken: optText(1000),
            }),
          )
          .min(1)
          .max(API_LIMITS.summariseExamples),
      }),
    )
    .min(1)
    .max(API_LIMITS.summariseClusters),
});
export type SummariseRequest = z.infer<typeof SummariseRequest>;
export type SummariseResponse = { summaries: (ClusterSummary & { clusterId: string })[] };

// ---------- /api/location-criticality ----------
export const LocationRequest = z.object({
  locations: z.array(text(300)).min(1).max(API_LIMITS.locations),
});
export type LocationRequest = z.infer<typeof LocationRequest>;
export type LocationResponse = { ratings: { location: string; criticality: Criticality; reason: string }[] };

// ---------- /api/draft-cr ----------
export const DraftCrRequest = z.object({
  cluster: z.object({
    clusterId: text(64),
    title: text(300),
    category: z.enum(CATEGORIES),
    othersSubTheme: optText(100),
    systemFunction: text(120),
    problemStatement: text(2000),
    likelyRootCause: text(1000),
    recommendedAction: text(1000),
    priorityBand: z.enum(["P1", "P2", "P3", "P4"]),
    score: z.number().min(0).max(100),
    metrics: z.object({
      recordCount: z.number().int().min(0),
      distinctLocations: z.number().int().min(0),
      locations: z.array(text(300)).max(20),
      firstSeen: optText(40),
      lastSeen: optText(40),
      meanSeverity: z.number().min(0).max(5).optional(),
      slaBreachRate: z.number().min(0).max(1).optional(),
      repeatLocationCount: z.number().int().min(0),
      operationalImpacts: z.array(text(40)).max(6),
      trades: z.array(text(80)).max(6),
    }),
    examples: z
      .array(
        z.object({
          sourceSheet: text(120),
          sourceRow: z.number().int(),
          description: text(2000),
          location: optText(300),
          actionTaken: optText(1000),
          reportedAt: optText(40),
        }),
      )
      .min(1)
      .max(API_LIMITS.crExamples),
  }),
});
export type DraftCrRequest = z.infer<typeof DraftCrRequest>;
export type DraftCrResponse = { cr: ChangeRequestAI };

// ---------- /api/insights ----------
export const InsightsRequest = z.object({
  stats: z.record(z.string(), z.unknown()),
});
export type InsightsRequest = z.infer<typeof InsightsRequest>;
export type InsightsResponse = { insights: string[] };

// ---------- errors ----------
export type ApiErrorCode =
  | "BAD_REQUEST"
  | "PAYLOAD_TOO_LARGE"
  | "RATE_LIMITED"
  | "UNAUTHORIZED"
  | "NOT_CONFIGURED"
  | "UPSTREAM_RATE_LIMITED"
  | "UPSTREAM_ERROR"
  | "INVALID_AI_RESPONSE"
  | "INTERNAL";
export type ApiErrorBody = { error: { code: ApiErrorCode; message: string } };

export type HealthResponse = { ok: true; aiConfigured: boolean; mock: boolean; accessCodeRequired: boolean; accessOk: boolean; model: string };
