"use client";

import { create } from "zustand";
import type { Category } from "@/config/categories";
import { emptyMapping } from "@/lib/parse/columns";
import { DEFAULT_WEIGHTS, CLUSTERING_CONFIG, type PriorityBand, type ScoringWeights } from "@/config/scoring";
import { DEFAULT_SHIFTS, MANPOWER_CONFIG } from "@/config/shifts";
import type { ManpowerSettings } from "@/lib/analysis/manpower";
import type { HealthResponse } from "@/lib/api/contracts";
import type {
  ChangeRequest,
  Classification,
  Cluster,
  Criticality,
  DataQualitySummary,
  DefectRecord,
  FieldDetection,
  LocationRating,
  MappingState,
  NormalisedStatus,
  ParsedWorkbook,
} from "@/lib/types";

// In-memory only — deliberately no `persist` middleware (see PRD §3).

export type Stage = "upload" | "sheets" | "mapping" | "running" | "locations" | "dashboard";

export type PipelineStageKey = "normalise" | "classify" | "embed" | "cluster" | "summarise" | "locations" | "crs";
export type StageStatus = "pending" | "running" | "done" | "partial" | "error" | "cancelled" | "skipped";
export type StageProgress = { status: StageStatus; done: number; total: number; failed: number; message?: string };

export const PIPELINE_STAGES: { key: PipelineStageKey; label: string }[] = [
  { key: "normalise", label: "Normalising" },
  { key: "classify", label: "Classifying" },
  { key: "embed", label: "Embedding" },
  { key: "cluster", label: "Clustering" },
  { key: "summarise", label: "Summarising clusters" },
  { key: "locations", label: "Rating locations" },
  { key: "crs", label: "Drafting CRs" },
];

export type DashboardTab =
  | "overview"
  | "reclass"
  | "clusters"
  | "queue"
  | "sla"
  | "locations"
  | "functions"
  | "manpower"
  | "crs"
  | "explorer";

export type Filters = {
  dateFrom?: string; // yyyy-mm-dd
  dateTo?: string;
  categories: Category[];
  locations: string[]; // normalised locations
  bands: PriorityBand[];
  statuses: NormalisedStatus[];
  sheets: string[];
  systemFunctions: string[];
  impacts: string[];
  trades: string[];
};

export const EMPTY_FILTERS: Filters = {
  categories: [],
  locations: [],
  bands: [],
  statuses: [],
  sheets: [],
  systemFunctions: [],
  impacts: [],
  trades: [],
};

export type Settings = {
  weights: ScoringWeights;
  similarityThreshold: number;
  minRecurringSize: number;
  referenceMode: "dataset" | "now";
  manpower: ManpowerSettings;
};

export const DEFAULT_SETTINGS: Settings = {
  weights: DEFAULT_WEIGHTS,
  similarityThreshold: CLUSTERING_CONFIG.similarityThreshold,
  minRecurringSize: CLUSTERING_CONFIG.minRecurringSize,
  referenceMode: "dataset",
  manpower: {
    shifts: DEFAULT_SHIFTS,
    utilisation: MANPOWER_CONFIG.utilisation,
    planForPeak: false,
    useObservedHours: true,
    hoursOverride: {},
  },
};

const initialProgress = (): Record<PipelineStageKey, StageProgress> =>
  Object.fromEntries(PIPELINE_STAGES.map((s) => [s.key, { status: "pending", done: 0, total: 0, failed: 0 }])) as Record<
    PipelineStageKey,
    StageProgress
  >;

export type AnalysisState = {
  // session gates
  consentGiven: boolean;
  accessCode: string | null;
  health: HealthResponse | null;

  stage: Stage;
  workbook: ParsedWorkbook | null;
  fileSize: number;
  selectedSheets: string[];
  mapping: MappingState;
  detections: FieldDetection[];
  dayFirst: boolean;

  records: DefectRecord[];
  quality: DataQualitySummary | null;

  classifications: Record<string, Classification>;
  categoryOverrides: Record<string, Category>;
  clusters: Cluster[];
  locationRatings: Record<string, LocationRating>;
  crs: Record<string, ChangeRequest>;
  crErrors: Record<string, string>;
  crInFlight: Record<string, boolean>;
  crCounter: number;
  autoCrDone: boolean;
  insights: string[] | null;
  insightsStatus: "idle" | "loading" | "error";

  progress: Record<PipelineStageKey, StageProgress>;
  pipelineRunning: boolean;
  pipelineError: string | null;
  analysedAt: string | null;

  settings: Settings;
  filters: Filters;
  activeTab: DashboardTab;
  expandedClusterId: string | null;
};

type Actions = {
  set: (patch: Partial<AnalysisState>) => void;
  setProgress: (key: PipelineStageKey, patch: Partial<StageProgress>) => void;
  resetProgress: () => void;
  setFilters: (patch: Partial<Filters>) => void;
  toggleFilter: <K extends keyof Filters>(key: K, value: Filters[K] extends (infer U)[] ? U : never) => void;
  clearFilters: () => void;
  setSettings: (patch: Partial<Settings>) => void;
  setManpower: (patch: Partial<ManpowerSettings>) => void;
  overrideCategory: (id: string, category: Category | null) => void;
  overrideLocation: (location: string, level: Criticality | null) => void;
  updateCr: (clusterId: string, patch: Partial<ChangeRequest>) => void;
  resetAll: () => void;
};

const initialState = (): AnalysisState => ({
  consentGiven: false,
  accessCode: null,
  health: null,
  stage: "upload",
  workbook: null,
  fileSize: 0,
  selectedSheets: [],
  mapping: emptyMapping(),
  detections: [],
  dayFirst: true,
  records: [],
  quality: null,
  classifications: {},
  categoryOverrides: {},
  clusters: [],
  locationRatings: {},
  crs: {},
  crErrors: {},
  crInFlight: {},
  crCounter: 0,
  autoCrDone: false,
  insights: null,
  insightsStatus: "idle",
  progress: initialProgress(),
  pipelineRunning: false,
  pipelineError: null,
  analysedAt: null,
  settings: DEFAULT_SETTINGS,
  filters: EMPTY_FILTERS,
  activeTab: "overview",
  expandedClusterId: null,
});

export const useAnalysisStore = create<AnalysisState & Actions>()((set) => ({
  ...initialState(),
  set: (patch) => set(patch),
  setProgress: (key, patch) => set((s) => ({ progress: { ...s.progress, [key]: { ...s.progress[key], ...patch } } })),
  resetProgress: () => set({ progress: initialProgress() }),
  setFilters: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),
  toggleFilter: (key, value) =>
    set((s) => {
      const arr = s.filters[key] as unknown[];
      const next = arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
      return { filters: { ...s.filters, [key]: next } };
    }),
  clearFilters: () => set({ filters: EMPTY_FILTERS }),
  setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
  setManpower: (patch) => set((s) => ({ settings: { ...s.settings, manpower: { ...s.settings.manpower, ...patch } } })),
  overrideCategory: (id, category) =>
    set((s) => {
      const next = { ...s.categoryOverrides };
      if (category === null || category === s.classifications[id]?.category) delete next[id];
      else next[id] = category;
      return { categoryOverrides: next };
    }),
  overrideLocation: (location, level) =>
    set((s) => {
      const cur = s.locationRatings[location] ?? { location };
      return { locationRatings: { ...s.locationRatings, [location]: { ...cur, override: level ?? undefined } } };
    }),
  updateCr: (clusterId, patch) =>
    set((s) => {
      const cur = s.crs[clusterId];
      if (!cur) return {};
      return { crs: { ...s.crs, [clusterId]: { ...cur, ...patch, edited: true } } };
    }),
  resetAll: () =>
    set((s) => ({
      ...initialState(),
      // Keep session-level acknowledgements so the user isn't asked again.
      consentGiven: s.consentGiven,
      accessCode: s.accessCode,
      health: s.health,
    })),
}));
