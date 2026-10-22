import type { Category, OperationalImpact } from "@/config/categories";
import type { CanonicalField } from "@/config/columnSynonyms";
import type { Criticality } from "@/config/locations";
import type { PriorityBand } from "@/config/scoring";

export type { Category, OperationalImpact, CanonicalField, Criticality, PriorityBand };

export type CellValue = string | number | boolean | Date | null;

/** A parsed worksheet: header row + data rows (as raw cell arrays). */
export type ParsedSheet = {
  name: string;
  headers: string[];
  /** 0-based index of the header row within the worksheet. */
  headerRowIndex: number;
  rows: CellValue[][];
};

export type ParsedWorkbook = {
  fileName: string;
  sheets: ParsedSheet[];
};

export type ColumnMapping = {
  column: string | null;
  /** For date fields: an optional separate time column to combine with the date. */
  timeColumn?: string | null;
};

export type MappingState = Record<CanonicalField, ColumnMapping>;

export type DetectionConfidence = "high" | "medium" | "low" | "none";

export type FieldDetection = {
  field: CanonicalField;
  column: string | null;
  confidence: DetectionConfidence;
  score: number;
  reason: string;
};

export type NormalisedStatus = "Open" | "Closed" | "Unknown";

export type DefectRecord = {
  id: string;
  sourceSheet: string;
  /** 1-based row number as seen in Excel. */
  sourceRow: number;
  legacyCategory: string;
  description: string;
  location?: string;
  /** Wall-clock times stored as UTC instants (see DECISIONS.md). */
  reportedAt?: Date;
  respondedAt?: Date;
  completedAt?: Date;
  status?: string;
  statusNormalised: NormalisedStatus;
  reportedBy?: string;
  assetOrEquipment?: string;
  actionTaken?: string;
  originalPriority?: string;
  extra: Record<string, unknown>;
  /** Derived during normalisation. */
  normalisedLocation?: string;
  isDuplicate: boolean;
  duplicateOf?: string;
};

export type DroppedRowReason = "blank" | "repeated-header" | "summary-row" | "missing-description";

export type DataQualitySummary = {
  rowsRead: number;
  rowsKept: number;
  dropped: Record<DroppedRowReason, number>;
  missingPct: Partial<Record<CanonicalField, number>>;
  exactDuplicates: number;
  unparseableDates: Partial<Record<CanonicalField, number>>;
  truncated: boolean;
};

export type Classification = {
  id: string;
  category: Category;
  othersSubTheme?: string;
  systemFunction: string;
  faultType: string;
  normalisedSummary: string;
  operationalImpact: OperationalImpact;
  severity: 1 | 2 | 3 | 4 | 5;
  suspectedRootCause: string;
  confidence: number;
  rationale: string;
  /** True when the category was locked by the keyword pre-classifier. */
  categoryLocked?: boolean;
};

export type ClusterSummary = {
  clusterTitle: string;
  consolidatedProblemStatement: string;
  likelyRootCause: string;
  affectedSystemFunction: string;
  recommendedAction: string;
};

export type Cluster = {
  id: string;
  /** Category the cluster was formed in (clusters are formed within a category). */
  category: Category;
  memberIds: string[];
  summary?: ClusterSummary;
};

export type LocationRating = {
  location: string;
  ai?: Criticality;
  reason?: string;
  override?: Criticality;
};

export type ChangeRequestAI = {
  title: string;
  problemStatement: string;
  operationalImpact: string;
  suspectedRootCause: string;
  immediateFix: string;
  permanentFix: string;
  acceptanceCriteria: string[];
  trades: string[];
  estimatedManHours: number;
  effortNotes: string;
};

export type ChangeRequest = ChangeRequestAI & {
  crId: string;
  clusterId: string;
  createdAt: string;
  /** Fields edited by the user (session only). */
  edited?: boolean;
};

export type SlaInfo = {
  responseHours?: number;
  turnaroundHours?: number;
  ageHours?: number;
  responseMet?: boolean;
  turnaroundMet?: boolean;
  isOpen: boolean;
  /** True when the record is open and older than the TAT target. */
  openBreached?: boolean;
  dataQualityIssue?: string;
};

export type ScoreBreakdown = {
  impact: number;
  frequency: number;
  location: number;
  sla: number;
  /** Weighted contribution of each component, in points (sums to score). */
  contributions: { impact: number; frequency: number; location: number; sla: number };
  score: number;
  band: PriorityBand;
  notes: string[];
};
