/** File and payload limits (client side). Server limits live in src/lib/server/limits.ts. */
export const FILE_LIMITS = {
  maxBytes: 10 * 1024 * 1024,
  maxRows: 10_000,
  acceptedExtensions: [".xlsx", ".xls", ".csv"],
};

/** Batch sizes and concurrency for the analysis pipeline. */
export const PIPELINE_CONFIG = {
  classifyBatchSize: 25,
  embedBatchSize: 100,
  summariseBatchSize: 10,
  summariseExamplesPerCluster: 8,
  locationBatchSize: 200,
  crExamples: 10,
  concurrency: 4,
  maxRetries: 3,
  /** 429s from our own rate limiter are retried more patiently. */
  maxRateLimitRetries: 8,
  baseBackoffMs: 1000,
};

/** Rough token estimates (characters ÷ 4) used for the pre-run estimate. */
export const TOKEN_ESTIMATE = {
  charsPerToken: 4,
  classifySystemPromptTokens: 1400,
  classifyOutputTokensPerRecord: 130,
  embedTokensPerRecord: 25,
  summariseTokensPerCluster: 600,
  crTokensPerCluster: 1800,
  /** Assumed share of records that end up in a P1/P2 cluster, for the CR estimate. */
  estimatedClusterShare: 0.04,
};
