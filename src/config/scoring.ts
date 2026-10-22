export type ScoringWeights = {
  impact: number;
  frequency: number;
  location: number;
  sla: number;
};

export const DEFAULT_WEIGHTS: ScoringWeights = {
  impact: 0.35,
  frequency: 0.25,
  location: 0.2,
  sla: 0.2,
};

export const SCORING_CONFIG = {
  /** Bonus added to the impact component for Safety/Security impacts (capped at 1). */
  safetySecurityBonus: 0.1,
  /** Bonus added to the frequency component for location repeats (capped at 1). */
  locationRepeatBonus: 0.2,
  locationValue: { High: 1.0, Medium: 0.5, Low: 0.2, Unknown: 0.5 },
  slaValue: { tatOrAgeBreach: 1.0, responseOnlyBreach: 0.6, met: 0, unknown: 0.3 },
  /** Cluster score = P75(member scores) × (1 + bonusPerLocation × min(maxLocations, distinct locations)). */
  clusterPercentile: 0.75,
  clusterLocationBonusPerLocation: 0.05,
  clusterLocationBonusMaxLocations: 10,
};

export type PriorityBand = "P1" | "P2" | "P3" | "P4";
export const PRIORITY_BAND_LIST: PriorityBand[] = ["P1", "P2", "P3", "P4"];

/** Lower bounds (inclusive) for each band. Anything below P3 is P4. */
export const PRIORITY_BANDS = { P1: 75, P2: 55, P3: 35 };

export const CLUSTERING_CONFIG = {
  /** Cosine similarity threshold for agglomerative (average-linkage) clustering. */
  similarityThreshold: 0.82,
  /** Minimum number of non-duplicate records for a cluster to count as a recurring issue. */
  minRecurringSize: 3,
  /** Location repeat: same category + location with ≥ minRecords within windowDays. */
  locationRepeatMinRecords: 2,
  locationRepeatWindowDays: 30,
  /** Duplicate detection: same description + location with reportedAt within this many minutes. */
  duplicateWindowMinutes: 10,
};
