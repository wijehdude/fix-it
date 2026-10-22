"use client";

import type { Category } from "@/config/categories";
import { FILE_LIMITS, PIPELINE_CONFIG, TOKEN_ESTIMATE } from "@/config/limits";
import { lockedCategoryFor } from "@/lib/analysis/preclassify";
import type { ClusterView, Derived } from "@/lib/analysis/derive";
import type {
  ClassifyRequest,
  ClassifyResponse,
  DraftCrRequest,
  DraftCrResponse,
  EmbedResponse,
  InsightsResponse,
  LocationResponse,
  SummariseRequest,
  SummariseResponse,
} from "@/lib/api/contracts";
import { formatDate } from "@/lib/parse/dates";
import { buildRecords } from "@/lib/parse/normalise";
import { scrubPII } from "@/lib/pii";
import type { Cluster, DefectRecord } from "@/lib/types";
import type { ClusterWorkerRequest, ClusterWorkerResponse } from "@/workers/cluster.worker";
import { agglomerativeCluster } from "@/lib/analysis/clustering";
import { useAnalysisStore, type PipelineStageKey } from "@/store/useAnalysisStore";
import { ApiClientError, apiPost, chunk, errorMessage, runPool } from "./api";
import { classificationCache, embeddingCache, hashText, summaryCache } from "./cache";

const store = () => useAnalysisStore.getState();
let controller: AbortController | null = null;

// ---------- helpers ----------
function classifyKey(r: DefectRecord, locked: Category | null): string {
  return hashText([r.description, r.location ?? "", r.assetOrEquipment ?? "", r.actionTaken ?? "", r.legacyCategory, locked ?? ""].join("␟"));
}

function embedText(id: string): string | undefined {
  const c = store().classifications[id];
  return c ? `${c.normalisedSummary} | ${c.faultType}` : undefined;
}

function effectiveCategory(id: string): Category | undefined {
  const s = store();
  return s.categoryOverrides[id] ?? s.classifications[id]?.category;
}

function stageResult(key: PipelineStageKey, total: number, failed: number, firstError?: unknown) {
  store().setProgress(key, {
    status: failed === 0 ? "done" : failed >= total ? "error" : "partial",
    failed,
    message: firstError ? errorMessage(firstError) : undefined,
  });
}

// ---------- step 1: normalise ----------
export function normaliseSelection(): boolean {
  const s = store();
  if (!s.workbook) return false;
  const sheets = s.workbook.sheets.filter((sh) => s.selectedSheets.includes(sh.name));
  const { records, quality } = buildRecords(sheets, s.mapping, { dayFirst: s.dayFirst, maxRows: FILE_LIMITS.maxRows });
  s.set({ records, quality });
  return records.length > 0;
}

// ---------- step 2: classify ----------
async function classifyStage(signal: AbortSignal) {
  const s = store();
  const pending: { rec: DefectRecord; locked: Category | null; key: string }[] = [];
  const fromCache: Record<string, (typeof s.classifications)[string]> = {};
  for (const rec of s.records) {
    if (s.classifications[rec.id]) continue;
    const locked = lockedCategoryFor(rec);
    const key = classifyKey(rec, locked);
    const hit = classificationCache.get(key);
    if (hit) fromCache[rec.id] = { ...hit, id: rec.id };
    else pending.push({ rec, locked, key });
  }
  if (Object.keys(fromCache).length) s.set({ classifications: { ...store().classifications, ...fromCache } });

  const total = s.records.length;
  const already = total - pending.length;
  s.setProgress("classify", { status: "running", total, done: already, failed: 0, message: undefined });
  if (!pending.length) return stageResult("classify", total, 0);

  let done = already;
  let failedRecords = 0;
  const batches = chunk(pending, PIPELINE_CONFIG.classifyBatchSize);
  const { failed } = await runPool(
    batches,
    PIPELINE_CONFIG.concurrency,
    async (batch) => {
      const body: ClassifyRequest = {
        records: batch.map(({ rec, locked }) => ({
          id: rec.id,
          description: scrubPII(rec.description).slice(0, 2000),
          location: scrubPII(rec.location)?.slice(0, 300),
          asset: scrubPII(rec.assetOrEquipment)?.slice(0, 300),
          actionTaken: scrubPII(rec.actionTaken)?.slice(0, 1000),
          legacyCategory: rec.legacyCategory.slice(0, 120),
          lockedCategory: locked,
        })),
      };
      const res = await apiPost<ClassifyResponse>("/api/classify", body, signal);
      const keyById = new Map(batch.map((b) => [b.rec.id, b.key]));
      const next = { ...store().classifications };
      for (const c of res.results) {
        next[c.id] = c;
        const key = keyById.get(c.id);
        if (key) {
          const { id: _id, ...rest } = c;
          void _id;
          classificationCache.set(key, rest);
        }
      }
      store().set({ classifications: next });
      done += res.results.length;
      failedRecords += res.missing.length;
      store().setProgress("classify", { done, failed: failedRecords });
      if (res.missing.length) throw new Error(`${res.missing.length} records were not classified in a batch`);
    },
    signal,
  );
  const failedCount = total - Object.keys(store().classifications).length;
  stageResult("classify", total, failedCount, failed[0]?.error);
}

// ---------- step 3: embed ----------
async function embedStage(signal: AbortSignal) {
  const s = store();
  const texts = new Set<string>();
  for (const r of s.records) {
    const t = embedText(r.id);
    if (t && !embeddingCache.has(hashText(t))) texts.add(t);
  }
  const allTexts = new Set(s.records.map((r) => embedText(r.id)).filter(Boolean));
  const total = allTexts.size;
  const pending = [...texts];
  let done = total - pending.length;
  s.setProgress("embed", { status: "running", total, done, failed: 0, message: undefined });
  if (!pending.length) return stageResult("embed", total, 0);

  let failedTexts = 0;
  const { failed } = await runPool(
    chunk(pending, PIPELINE_CONFIG.embedBatchSize),
    PIPELINE_CONFIG.concurrency,
    async (batch) => {
      try {
        const res = await apiPost<EmbedResponse>("/api/embed", { texts: batch.map((t) => t.slice(0, 1000)) }, signal);
        batch.forEach((t, i) => embeddingCache.set(hashText(t), Float32Array.from(res.embeddings[i])));
        done += batch.length;
        store().setProgress("embed", { done });
      } catch (err) {
        failedTexts += batch.length;
        store().setProgress("embed", { failed: failedTexts });
        throw err;
      }
    },
    signal,
  );
  stageResult("embed", total, failedTexts, failed[0]?.error);
}

// ---------- step 4: cluster (Web Worker) ----------
function runClusterWorker(req: ClusterWorkerRequest, signal: AbortSignal): Promise<Record<string, number[]>> {
  if (typeof Worker === "undefined") {
    const labels: Record<string, number[]> = {};
    for (const g of req.groups) labels[g.key] = agglomerativeCluster(g.vectors, req.threshold);
    return Promise.resolve(labels);
  }
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../../workers/cluster.worker.ts", import.meta.url), { type: "module" });
    const cleanup = () => worker.terminate();
    signal.addEventListener("abort", () => {
      cleanup();
      reject(new ApiClientError("ABORTED", "Cancelled"));
    }, { once: true });
    worker.onmessage = (e: MessageEvent<ClusterWorkerResponse>) => {
      cleanup();
      if ("error" in e.data) reject(new Error(e.data.error));
      else resolve(e.data.labels);
    };
    worker.onerror = (e) => {
      cleanup();
      reject(new Error(e.message || "Clustering worker failed"));
    };
    worker.postMessage(req);
  });
}

export async function clusterStage(signal: AbortSignal) {
  const s = store();
  s.setProgress("cluster", { status: "running", total: 1, done: 0, failed: 0, message: undefined });
  const groups = new Map<string, { ids: string[]; vectors: Float32Array[] }>();
  for (const r of s.records) {
    const cat = effectiveCategory(r.id);
    const t = embedText(r.id);
    const v = t ? embeddingCache.get(hashText(t)) : undefined;
    if (!cat || !v) continue;
    const g = groups.get(cat) ?? { ids: [], vectors: [] };
    g.ids.push(r.id);
    g.vectors.push(v);
    groups.set(cat, g);
  }
  if (!groups.size) {
    s.set({ clusters: [] });
    return s.setProgress("cluster", { status: "skipped", message: "No embeddings available" });
  }
  const labels = await runClusterWorker(
    { threshold: s.settings.similarityThreshold, groups: [...groups].map(([key, g]) => ({ key, vectors: g.vectors })) },
    signal,
  );
  const clusters: Cluster[] = [];
  for (const [cat, g] of groups) {
    const byLabel = new Map<number, string[]>();
    labels[cat].forEach((l, i) => byLabel.set(l, [...(byLabel.get(l) ?? []), g.ids[i]]));
    for (const memberIds of byLabel.values()) {
      const id = `c${hashText([...memberIds].sort().join(","))}`;
      clusters.push({ id, category: cat as Category, memberIds, summary: summaryCache.get(id) });
    }
  }
  s.set({ clusters });
  s.setProgress("cluster", { status: "done", done: 1 });
}

// ---------- step 5: summarise recurring clusters ----------
function representativeExamples(c: Cluster, max: number) {
  const s = store();
  const recs = c.memberIds.map((id) => s.records.find((r) => r.id === id)).filter((r): r is DefectRecord => Boolean(r));
  const seen = new Set<string>();
  const out: SummariseRequest["clusters"][number]["examples"] = [];
  for (const r of [...recs.filter((r) => !r.isDuplicate), ...recs.filter((r) => r.isDuplicate)]) {
    const key = r.description.toLowerCase();
    if (seen.has(key) && recs.length > max) continue;
    seen.add(key);
    out.push({
      description: scrubPII(r.description).slice(0, 2000),
      location: scrubPII(r.location)?.slice(0, 300),
      faultType: s.classifications[r.id]?.faultType?.slice(0, 200),
      actionTaken: scrubPII(r.actionTaken)?.slice(0, 1000),
    });
    if (out.length >= max) break;
  }
  return out;
}

export async function summariseStage(signal: AbortSignal) {
  const s = store();
  const dup = new Set(s.records.filter((r) => r.isDuplicate).map((r) => r.id));
  const recurring = s.clusters.filter((c) => c.memberIds.filter((id) => !dup.has(id)).length >= s.settings.minRecurringSize);
  const pending = recurring.filter((c) => !c.summary);
  const total = recurring.length;
  let done = total - pending.length;
  s.setProgress("summarise", { status: "running", total, done, failed: 0, message: undefined });
  if (!pending.length) return stageResult("summarise", total, 0);

  let failedClusters = 0;
  const { failed } = await runPool(
    chunk(pending, PIPELINE_CONFIG.summariseBatchSize),
    PIPELINE_CONFIG.concurrency,
    async (batch) => {
      try {
        const body: SummariseRequest = {
          clusters: batch.map((c) => ({
            clusterId: c.id,
            category: c.category,
            examples: representativeExamples(c, PIPELINE_CONFIG.summariseExamplesPerCluster),
          })),
        };
        const res = await apiPost<SummariseResponse>("/api/summarise-clusters", body, signal);
        const byId = new Map(res.summaries.map((x) => [x.clusterId, x]));
        for (const c of batch) {
          const sum = byId.get(c.id);
          if (sum) {
            const { clusterId: _cid, ...summary } = sum;
            void _cid;
            summaryCache.set(c.id, summary);
          }
        }
        store().set({ clusters: store().clusters.map((c) => (summaryCache.has(c.id) ? { ...c, summary: summaryCache.get(c.id) } : c)) });
        const got = batch.filter((c) => byId.has(c.id)).length;
        done += got;
        failedClusters += batch.length - got;
        store().setProgress("summarise", { done, failed: failedClusters });
      } catch (err) {
        failedClusters += batch.length;
        store().setProgress("summarise", { failed: failedClusters });
        throw err;
      }
    },
    signal,
  );
  stageResult("summarise", total, failedClusters, failed[0]?.error);
}

// ---------- step 6: location criticality ----------
async function locationStage(signal: AbortSignal) {
  const s = store();
  const all = [...new Set(s.records.map((r) => r.normalisedLocation).filter((l): l is string => Boolean(l)))];
  const pending = all.filter((l) => !s.locationRatings[l]?.ai);
  const total = all.length;
  let done = total - pending.length;
  s.setProgress("locations", { status: "running", total, done, failed: 0, message: undefined });
  if (!pending.length) return stageResult("locations", total, 0);

  let failedLocs = 0;
  const { failed } = await runPool(
    chunk(pending, PIPELINE_CONFIG.locationBatchSize),
    PIPELINE_CONFIG.concurrency,
    async (batch) => {
      try {
        const res = await apiPost<LocationResponse>("/api/location-criticality", { locations: batch }, signal);
        const next = { ...store().locationRatings };
        for (const r of res.ratings) next[r.location] = { ...next[r.location], location: r.location, ai: r.criticality, reason: r.reason };
        store().set({ locationRatings: next });
        done += res.ratings.length;
        failedLocs += batch.length - res.ratings.length;
        store().setProgress("locations", { done, failed: failedLocs });
      } catch (err) {
        failedLocs += batch.length;
        store().setProgress("locations", { failed: failedLocs });
        throw err;
      }
    },
    signal,
  );
  stageResult("locations", total, failedLocs, failed[0]?.error);
}

// ---------- orchestration ----------
/** Runs (or resumes) the pipeline. Completed work is cached, so re-running only retries what failed. */
export async function runPipeline(): Promise<void> {
  const s = store();
  if (s.pipelineRunning) return;
  controller = new AbortController();
  const signal = controller.signal;
  s.set({ pipelineRunning: true, pipelineError: null, stage: s.stage === "dashboard" ? "dashboard" : "running" });
  s.setProgress("normalise", { status: "done", total: s.records.length, done: s.records.length });
  try {
    await classifyStage(signal);
    await embedStage(signal);
    await clusterStage(signal);
    await summariseStage(signal);
    await locationStage(signal);
    store().set({ analysedAt: new Date().toISOString() });
    if (store().stage === "running") store().set({ stage: "locations" });
  } catch (err) {
    if (err instanceof ApiClientError && err.code === "ABORTED") {
      for (const [k, p] of Object.entries(store().progress)) {
        if (p.status === "running") store().setProgress(k as PipelineStageKey, { status: "cancelled" });
      }
      store().set({ pipelineError: "Analysis cancelled. You can resume — completed work is kept." });
    } else {
      store().set({ pipelineError: errorMessage(err) });
    }
  } finally {
    store().set({ pipelineRunning: false });
    controller = null;
  }
}

export function cancelPipeline() {
  controller?.abort();
}

/** Re-clusters with the current threshold / overrides and summarises any new recurring clusters. */
export async function recluster(): Promise<void> {
  const s = store();
  if (s.pipelineRunning) return;
  controller = new AbortController();
  s.set({ pipelineRunning: true, pipelineError: null });
  try {
    await clusterStage(controller.signal);
    await summariseStage(controller.signal);
  } catch (err) {
    store().set({ pipelineError: errorMessage(err) });
  } finally {
    store().set({ pipelineRunning: false });
    controller = null;
  }
}

// ---------- change requests ----------
function todayStamp(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

export async function draftCr(cluster: ClusterView): Promise<void> {
  const s = store();
  if (s.crInFlight[cluster.id]) return;
  s.set({ crInFlight: { ...s.crInFlight, [cluster.id]: true }, crErrors: { ...s.crErrors, [cluster.id]: "" } });
  try {
    const live = cluster.members.filter((m) => !m.isDuplicate);
    const examples = [...live].sort((a, b) => b.score.score - a.score.score).slice(0, PIPELINE_CONFIG.crExamples);
    const body: DraftCrRequest = {
      cluster: {
        clusterId: cluster.id,
        title: cluster.title.slice(0, 300),
        category: cluster.category,
        othersSubTheme: cluster.othersSubTheme,
        systemFunction: cluster.systemFunction.slice(0, 120),
        problemStatement: (cluster.summary?.consolidatedProblemStatement ?? cluster.title).slice(0, 2000),
        likelyRootCause: (cluster.summary?.likelyRootCause ?? "Not yet assessed").slice(0, 1000),
        recommendedAction: (cluster.summary?.recommendedAction ?? "Not yet assessed").slice(0, 1000),
        priorityBand: cluster.band,
        score: Math.round(cluster.score * 10) / 10,
        metrics: {
          recordCount: cluster.count,
          distinctLocations: cluster.locations.length,
          locations: cluster.locations.slice(0, 20).map((l) => scrubPII(l).slice(0, 300)),
          firstSeen: cluster.firstSeen ? formatDate(cluster.firstSeen) : undefined,
          lastSeen: cluster.lastSeen ? formatDate(cluster.lastSeen) : undefined,
          meanSeverity: cluster.meanSeverity,
          slaBreachRate: cluster.slaBreachRate,
          repeatLocationCount: cluster.repeatLocationCount,
          operationalImpacts: cluster.impacts.slice(0, 6),
          trades: cluster.trades.slice(0, 6),
        },
        examples: examples.map((m) => ({
          sourceSheet: m.sourceSheet.slice(0, 120),
          sourceRow: m.sourceRow,
          description: scrubPII(m.description).slice(0, 2000),
          location: scrubPII(m.location)?.slice(0, 300),
          actionTaken: scrubPII(m.actionTaken)?.slice(0, 1000),
          reportedAt: m.reportedAt ? formatDate(m.reportedAt) : undefined,
        })),
      },
    };
    const res = await apiPost<DraftCrResponse>("/api/draft-cr", body);
    const counter = store().crCounter + 1;
    const existing = store().crs[cluster.id];
    store().set({
      crCounter: counter,
      crs: {
        ...store().crs,
        [cluster.id]: {
          ...res.cr,
          crId: existing?.crId ?? `CR-${todayStamp()}-${String(counter).padStart(3, "0")}`,
          clusterId: cluster.id,
          createdAt: new Date().toISOString(),
        },
      },
    });
  } catch (err) {
    store().set({ crErrors: { ...store().crErrors, [cluster.id]: errorMessage(err) } });
  } finally {
    const { [cluster.id]: _drop, ...rest } = store().crInFlight;
    void _drop;
    store().set({ crInFlight: rest });
  }
}

/** Drafts CRs for the given clusters (P1/P2 by default) with the pipeline concurrency limit. */
export async function draftCrs(clusters: ClusterView[]): Promise<void> {
  const todo = clusters.filter((c) => !store().crs[c.id] && !store().crInFlight[c.id]);
  const total = todo.length;
  if (!total) {
    store().setProgress("crs", { status: "done" });
    return;
  }
  let done = 0;
  store().setProgress("crs", { status: "running", total, done: 0, failed: 0, message: undefined });
  await runPool(todo, PIPELINE_CONFIG.concurrency, async (c) => {
    await draftCr(c);
    done++;
    store().setProgress("crs", { done, failed: todo.filter((t) => store().crErrors[t.id]).length });
  });
  const failedCount = todo.filter((t) => store().crErrors[t.id]).length;
  stageResult("crs", total, failedCount);
}

// ---------- insights ----------
export function buildInsightStats(d: Derived): Record<string, unknown> {
  const live = d.records.filter((r) => !r.isDuplicate);
  const byCat: Record<string, number> = {};
  for (const r of live) byCat[r.category] = (byCat[r.category] ?? 0) + 1;
  const respKnown = live.filter((r) => r.sla.responseMet !== undefined);
  const tatKnown = live.filter((r) => r.sla.turnaroundMet !== undefined);
  const legacyOthers = live.filter((r) => /other/i.test(r.legacyCategory));
  const reclassified = legacyOthers.filter((r) => r.category !== "Others");
  const bands: Record<string, number> = { P1: 0, P2: 0, P3: 0, P4: 0 };
  for (const r of live) bands[r.score.band]++;
  const recurring = d.clusters.filter((c) => c.isRecurring);
  return {
    totalRecords: live.length,
    openRecords: live.filter((r) => r.sla.isOpen).length,
    dateRange: { from: d.months[0], to: d.months[d.months.length - 1] },
    recordsByCategory: byCat,
    responseSlaMetPct: respKnown.length ? Math.round((respKnown.filter((r) => r.sla.responseMet).length / respKnown.length) * 100) : null,
    tatSlaMetPct: tatKnown.length ? Math.round((tatKnown.filter((r) => r.sla.turnaroundMet).length / tatKnown.length) * 100) : null,
    slaTargets: "response ≤ 2 h, turnaround ≤ 4 h",
    recordPriorityBands: bands,
    recurringIssueCount: recurring.length,
    p1ClusterCount: recurring.filter((c) => c.band === "P1").length,
    topRecurringIssues: recurring.slice(0, 5).map((c) => ({
      title: c.title,
      category: c.category,
      reports: c.count,
      locations: c.locations.length,
      band: c.band,
      slaBreachPct: c.slaBreachRate === undefined ? null : Math.round(c.slaBreachRate * 100),
    })),
    legacyOthers: legacyOthers.length,
    legacyOthersReclassified: reclassified.length,
    locationRepeatRecords: live.filter((r) => r.isLocationRepeat).length,
  };
}

export async function fetchInsights(d: Derived): Promise<void> {
  store().set({ insightsStatus: "loading" });
  try {
    const res = await apiPost<InsightsResponse>("/api/insights", { stats: buildInsightStats(d) });
    store().set({ insights: res.insights, insightsStatus: "idle" });
  } catch {
    store().set({ insightsStatus: "error" });
  }
}

// ---------- token estimate ----------
export function estimateTokens(records: DefectRecord[]): { input: number; output: number; total: number; requests: number } {
  const cpt = TOKEN_ESTIMATE.charsPerToken;
  const textChars = records.reduce(
    (a, r) => a + r.description.length + (r.location?.length ?? 0) + (r.assetOrEquipment?.length ?? 0) + (r.actionTaken?.length ?? 0) + 80,
    0,
  );
  const batches = Math.ceil(records.length / PIPELINE_CONFIG.classifyBatchSize);
  const classifyIn = textChars / cpt + batches * TOKEN_ESTIMATE.classifySystemPromptTokens;
  const classifyOut = records.length * TOKEN_ESTIMATE.classifyOutputTokensPerRecord;
  const embed = records.length * TOKEN_ESTIMATE.embedTokensPerRecord;
  const clusters = Math.max(1, Math.round(records.length * TOKEN_ESTIMATE.estimatedClusterShare));
  const summarise = clusters * TOKEN_ESTIMATE.summariseTokensPerCluster;
  const crs = Math.round(clusters * 0.5) * TOKEN_ESTIMATE.crTokensPerCluster;
  const input = Math.round(classifyIn + embed + summarise * 0.7 + crs * 0.6);
  const output = Math.round(classifyOut + summarise * 0.3 + crs * 0.4);
  const requests =
    batches + Math.ceil(records.length / PIPELINE_CONFIG.embedBatchSize) + Math.ceil(clusters / PIPELINE_CONFIG.summariseBatchSize) + Math.round(clusters * 0.5) + 2;
  return { input, output, total: input + output, requests };
}
