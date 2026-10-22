import type { Category } from "@/config/categories";
import { CLUSTERING_CONFIG, type PriorityBand, type ScoringWeights } from "@/config/scoring";
import { monthKey, fromDateInputValue, DAY_MS } from "@/lib/parse/dates";
import type {
  Classification,
  Cluster,
  ClusterSummary,
  Criticality,
  DefectRecord,
  LocationRating,
  ScoreBreakdown,
  SlaInfo,
} from "@/lib/types";
import type { Filters } from "@/store/useAnalysisStore";
import { findLocationRepeats } from "./clustering";
import { effectiveCriticality } from "./locations";
import { tradeFor } from "./manpower";
import { keywordClassify, legacyToCategory, lockedCategoryFor } from "./preclassify";
import { bandFor, p95ClusterSize, scoreCluster, scoreRecord } from "./scoring";
import { computeSla, latestTimestamp } from "./sla";
import { mean } from "./stats";

export type EnrichedRecord = DefectRecord & {
  cls?: Classification;
  category: Category;
  categorySource: "ai" | "override" | "fallback";
  othersSubTheme?: string;
  trade: string;
  sla: SlaInfo;
  clusterId?: string;
  clusterSize: number;
  isLocationRepeat: boolean;
  criticality: Criticality | "Unknown";
  score: ScoreBreakdown;
};

export type ClusterView = {
  id: string;
  category: Category;
  memberIds: string[];
  members: EnrichedRecord[];
  /** Non-duplicate member count. */
  count: number;
  isRecurring: boolean;
  summary?: ClusterSummary;
  title: string;
  systemFunction: string;
  othersSubTheme?: string;
  locations: string[];
  firstSeen?: Date;
  lastSeen?: Date;
  monthly: { month: string; count: number }[];
  meanSeverity?: number;
  slaBreachRate?: number;
  repeatLocationCount: number;
  score: number;
  band: PriorityBand;
  trades: string[];
  impacts: string[];
};

export type DeriveInput = {
  records: DefectRecord[];
  classifications: Record<string, Classification>;
  categoryOverrides: Record<string, Category>;
  clusters: Cluster[];
  locationRatings: Record<string, LocationRating>;
  weights: ScoringWeights;
  minRecurringSize: number;
  referenceMode: "dataset" | "now";
  now?: Date;
};

export type Derived = {
  records: EnrichedRecord[];
  byId: Map<string, EnrichedRecord>;
  clusters: ClusterView[];
  clusterById: Map<string, ClusterView>;
  referenceDate?: Date;
  months: string[];
  p95ClusterSize: number;
};

function fallbackCategory(r: DefectRecord): Category {
  const locked = lockedCategoryFor(r);
  if (locked) return locked;
  const kw = keywordClassify({ description: r.description, location: r.location, asset: r.assetOrEquipment });
  if (kw.highConfidence && kw.category) return kw.category;
  return legacyToCategory(r.legacyCategory) ?? "Others";
}

function mostCommon<T>(values: T[]): T | undefined {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: T | undefined;
  let n = 0;
  for (const [v, c] of counts) {
    if (c > n) {
      best = v;
      n = c;
    }
  }
  return best;
}

export function monthRange(dates: Date[]): string[] {
  if (!dates.length) return [];
  let min = Infinity;
  let max = -Infinity;
  for (const d of dates) {
    const t = d.getTime();
    if (t < min) min = t;
    if (t > max) max = t;
  }
  const out: string[] = [];
  const cur = new Date(min);
  let y = cur.getUTCFullYear();
  let m = cur.getUTCMonth();
  const end = monthKey(new Date(max));
  for (let guard = 0; guard < 600; guard++) {
    const key = `${y}-${String(m + 1).padStart(2, "0")}`;
    out.push(key);
    if (key === end) break;
    m++;
    if (m > 11) {
      m = 0;
      y++;
    }
  }
  return out;
}

/** Computes every derived metric. Pure and fast (~1,500 records well under 300 ms). */
export function deriveAnalysis(input: DeriveInput): Derived {
  const referenceDate = input.referenceMode === "now" ? (input.now ?? new Date()) : latestTimestamp(input.records);

  // 1. Effective category, sub-theme, trade, SLA.
  const base = input.records.map((r) => {
    const cls = input.classifications[r.id];
    const override = input.categoryOverrides[r.id];
    const category: Category = override ?? cls?.category ?? fallbackCategory(r);
    const categorySource: EnrichedRecord["categorySource"] = override ? "override" : cls ? "ai" : "fallback";
    const othersSubTheme = category === "Others" ? (cls?.othersSubTheme ?? (cls ? "General" : "Unclassified")) : undefined;
    return {
      ...r,
      cls,
      category,
      categorySource,
      othersSubTheme,
      trade: tradeFor({
        category,
        othersSubTheme,
        systemFunction: cls?.systemFunction,
        faultType: cls?.faultType,
        description: r.description,
      }),
      sla: computeSla(r, referenceDate),
    };
  });

  // 2. Cluster membership and sizes (non-duplicates only).
  const recordCluster = new Map<string, string>();
  const clusterLive = new Map<string, number>();
  const dupSet = new Set(input.records.filter((r) => r.isDuplicate).map((r) => r.id));
  for (const c of input.clusters) {
    let live = 0;
    for (const id of c.memberIds) {
      recordCluster.set(id, c.id);
      if (!dupSet.has(id)) live++;
    }
    clusterLive.set(c.id, live);
  }
  const p95 = p95ClusterSize([...clusterLive.values()]);

  // 3. Location repeats (same effective category + normalised location within 30 days).
  const repeats = findLocationRepeats(
    base.map((r) => ({ id: r.id, category: r.category, location: r.normalisedLocation, reportedAt: r.reportedAt, isDuplicate: r.isDuplicate })),
    CLUSTERING_CONFIG.locationRepeatMinRecords,
    CLUSTERING_CONFIG.locationRepeatWindowDays,
  );

  // 4. Scores.
  const records: EnrichedRecord[] = base.map((r) => {
    const clusterId = recordCluster.get(r.id);
    const clusterSize = clusterId ? Math.max(1, clusterLive.get(clusterId) ?? 1) : 1;
    const isLocationRepeat = repeats.has(r.id);
    const criticality = r.normalisedLocation ? effectiveCriticality(input.locationRatings[r.normalisedLocation]) : "Unknown";
    const score = scoreRecord(
      { severity: r.cls?.severity, impact: r.cls?.operationalImpact, clusterSize, isLocationRepeat, criticality, sla: r.sla },
      input.weights,
      p95,
    );
    return { ...r, clusterId, clusterSize, isLocationRepeat, criticality, score };
  });
  const byId = new Map(records.map((r) => [r.id, r]));

  // 5. Cluster views.
  const allDates = records.flatMap((r) => (r.reportedAt ? [r.reportedAt] : []));
  const months = monthRange(allDates);
  const clusters: ClusterView[] = input.clusters.map((c) => {
    const members = c.memberIds.map((id) => byId.get(id)).filter((r): r is EnrichedRecord => Boolean(r));
    const live = members.filter((m) => !m.isDuplicate);
    const scoringSet = live.length ? live : members;
    const locations = [...new Set(live.map((m) => m.normalisedLocation).filter((l): l is string => Boolean(l)))];
    const dates = live.flatMap((m) => (m.reportedAt ? [m.reportedAt.getTime()] : []));
    const monthCounts = new Map<string, number>();
    for (const m of live) if (m.reportedAt) monthCounts.set(monthKey(m.reportedAt), (monthCounts.get(monthKey(m.reportedAt)) ?? 0) + 1);
    const assessable = live.filter((m) => m.sla.responseMet !== undefined || m.sla.turnaroundMet !== undefined || m.sla.openBreached !== undefined);
    const breached = assessable.filter((m) => m.sla.responseMet === false || m.sla.turnaroundMet === false || m.sla.openBreached === true);
    const severities = live.flatMap((m) => (m.cls ? [m.cls.severity] : []));
    const score = scoreCluster(scoringSet.map((m) => m.score.score), locations.length);
    const category = mostCommon(members.map((m) => m.category)) ?? c.category;
    const topFault = mostCommon(live.flatMap((m) => (m.cls ? [m.cls.faultType] : [])));
    const topLoc = mostCommon(live.flatMap((m) => (m.location ? [m.location] : [])));
    return {
      id: c.id,
      category,
      memberIds: c.memberIds,
      members,
      count: live.length,
      isRecurring: live.length >= input.minRecurringSize,
      summary: c.summary,
      title: c.summary?.clusterTitle ?? [topFault ?? members[0]?.description ?? "Issue", topLoc].filter(Boolean).join(" — "),
      systemFunction: c.summary?.affectedSystemFunction ?? mostCommon(live.flatMap((m) => (m.cls ? [m.cls.systemFunction] : []))) ?? "Other",
      othersSubTheme: category === "Others" ? mostCommon(live.flatMap((m) => (m.othersSubTheme ? [m.othersSubTheme] : []))) : undefined,
      locations,
      firstSeen: dates.length ? new Date(Math.min(...dates)) : undefined,
      lastSeen: dates.length ? new Date(Math.max(...dates)) : undefined,
      monthly: months.map((month) => ({ month, count: monthCounts.get(month) ?? 0 })),
      meanSeverity: mean(severities),
      slaBreachRate: assessable.length ? breached.length / assessable.length : undefined,
      repeatLocationCount: live.filter((m) => m.isLocationRepeat).length,
      score,
      band: bandFor(score),
      trades: [...new Set(live.map((m) => m.trade))],
      impacts: [...new Set(live.flatMap((m) => (m.cls ? [m.cls.operationalImpact] : [])))],
    };
  });
  clusters.sort((a, b) => b.score - a.score || b.count - a.count);

  return {
    records,
    byId,
    clusters,
    clusterById: new Map(clusters.map((c) => [c.id, c])),
    referenceDate,
    months,
    p95ClusterSize: p95,
  };
}

// ---------- filtering ----------

export function recordMatches(r: EnrichedRecord, f: Filters, opts: { ignoreBand?: boolean } = {}): boolean {
  if (f.dateFrom || f.dateTo) {
    if (!r.reportedAt) return false;
    const from = fromDateInputValue(f.dateFrom ?? "");
    const to = fromDateInputValue(f.dateTo ?? "");
    if (from && r.reportedAt < from) return false;
    if (to && r.reportedAt.getTime() >= to.getTime() + DAY_MS) return false;
  }
  if (f.categories.length && !f.categories.includes(r.category)) return false;
  if (f.locations.length && !(r.normalisedLocation && f.locations.includes(r.normalisedLocation))) return false;
  if (!opts.ignoreBand && f.bands.length && !f.bands.includes(r.score.band)) return false;
  if (f.statuses.length && !f.statuses.includes(r.statusNormalised)) return false;
  if (f.sheets.length && !f.sheets.includes(r.sourceSheet)) return false;
  if (f.systemFunctions.length && !(r.cls && f.systemFunctions.includes(r.cls.systemFunction))) return false;
  if (f.impacts.length && !(r.cls && f.impacts.includes(r.cls.operationalImpact))) return false;
  if (f.trades.length && !f.trades.includes(r.trade)) return false;
  return true;
}

/** Clusters with at least one member matching the filters; the band filter applies to the cluster band. */
export function filterClusters(clusters: ClusterView[], f: Filters): ClusterView[] {
  return clusters.filter(
    (c) => (!f.bands.length || f.bands.includes(c.band)) && c.members.some((m) => recordMatches(m, f, { ignoreBand: true })),
  );
}

export function filtersActive(f: Filters): boolean {
  return Boolean(
    f.dateFrom ||
      f.dateTo ||
      f.categories.length ||
      f.locations.length ||
      f.bands.length ||
      f.statuses.length ||
      f.sheets.length ||
      f.systemFunctions.length ||
      f.impacts.length ||
      f.trades.length,
  );
}
