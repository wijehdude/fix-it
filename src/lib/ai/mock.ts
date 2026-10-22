import "server-only";
/**
 * Deterministic offline stand-in for the OpenAI calls, enabled only with MOCK_AI=1.
 * Used for the Playwright smoke test and for demos before an API key is configured.
 * Results are heuristic (keywords, hashed bag-of-words embeddings) — NOT real AI output.
 */
import { OTHERS_SUB_THEMES, type Category, type OperationalImpact } from "@/config/categories";
import { CATEGORY_TRADE } from "@/config/trades";
import { keywordClassify, legacyToCategory } from "@/lib/analysis/preclassify";
import type { ChangeRequestAI, Classification, ClusterSummary, Criticality } from "@/lib/types";
import type { ClassifyRequest, DraftCrRequest, SummariseRequest } from "@/lib/api/contracts";

export function mockEnabled(): boolean {
  return process.env.MOCK_AI === "1" || process.env.MOCK_AI === "true";
}

const SUB_THEMES: [RegExp, string][] = [
  [/\blift|escalator/i, "Lift"],
  [/cockroach|rat|ant|pest|termite|mosquito/i, "Pest Control"],
  [/ceiling|wall|seepage|roof|crack|tile/i, "Building Fabric"],
  [/chair|table|drawer|carpet|furniture|cabinet/i, "Furniture"],
  [/wifi|network|internet|port|it\b/i, "IT/Network"],
  [/pipe|drain|plumb|riser/i, "Plumbing"],
  [/sign/i, "Signage"],
  [/power|socket|spark|rccb|trip/i, "Electrical Power"],
];

const FUNCTION_BY_CATEGORY: Record<Category, string> = {
  "Air Con": "ACMV – Cooling/Heating",
  Lighting: "Electrical – General Lighting",
  Cleaning: "Housekeeping – General Areas",
  Toilet: "Sanitary – Toilet Fixtures",
  "Physical Security": "Security – Access Control",
  Others: "Other",
};

const FUNCTION_BY_SUBTHEME: Record<string, string> = {
  Lift: "Vertical Transport (Lifts/Escalators)",
  "Pest Control": "Pest Control",
  "Building Fabric": "Building Fabric & Structure",
  Furniture: "Furniture & Fittings",
  "IT/Network": "IT/Communications",
  Plumbing: "Sanitary – Plumbing & Drainage",
  "Electrical Power": "Electrical – Power",
};

const STOP = new Set("the a an at in on of to from and is are was very pls please asp asap attend reported by tenant call".split(" "));
function words(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w) && !/^\d+$/.test(w));
}

function faultLabel(description: string): string {
  const w = words(description).slice(0, 4);
  const s = w.join(" ") || "unspecified fault";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function severityFor(text: string, category: Category): { severity: 1 | 2 | 3 | 4 | 5; impact: OperationalImpact } {
  if (/cannot lock|not locking|ajar|trapped|spark|server room|exposed|intrusion|maglock/i.test(text)) {
    return { severity: 5, impact: category === "Physical Security" ? "Security" : "Safety" };
  }
  if (/tripping|slippery|alarm|emergency|exit/i.test(text)) return { severity: 4, impact: "Safety" };
  if (/whole|several|no power|breakdown|stuck|overflow/i.test(text)) return { severity: 4, impact: "Service Disruption" };
  if (/chok|not working|leak|drip|offline|faulty|not cold|warm|dark/i.test(text)) {
    return { severity: 3, impact: category === "Toilet" || category === "Cleaning" ? "Hygiene" : "Service Disruption" };
  }
  if (/dirty|smell|odour|stain|litter|bin|soap|paper/i.test(text)) return { severity: 2, impact: "Hygiene" };
  if (/cold|noise|noisy|slow/i.test(text)) return { severity: 2, impact: "Comfort" };
  return { severity: 2, impact: "Cosmetic" };
}

export function mockClassify(records: ClassifyRequest["records"]): Classification[] {
  return records.map((r) => {
    const kw = keywordClassify({ description: r.description, location: r.location, asset: r.asset });
    const category: Category = r.lockedCategory ?? (kw.score >= 2.5 && kw.category ? kw.category : (legacyToCategory(r.legacyCategory) ?? "Others"));
    const sub = category === "Others" ? (SUB_THEMES.find(([re]) => re.test(r.description))?.[1] ?? OTHERS_SUB_THEMES[OTHERS_SUB_THEMES.length - 1]) : undefined;
    const { severity, impact } = severityFor(`${r.description} ${r.location ?? ""}`, category);
    const conf = r.lockedCategory ? 0.95 : kw.highConfidence ? 0.85 : kw.score > 0 ? 0.62 : 0.5;
    return {
      id: r.id,
      category,
      othersSubTheme: sub,
      systemFunction: sub ? (FUNCTION_BY_SUBTHEME[sub] ?? "Other") : FUNCTION_BY_CATEGORY[category],
      faultType: faultLabel(r.description),
      normalisedSummary: `${faultLabel(r.description)}${r.location ? ` at ${r.location}` : ""}`.slice(0, 160),
      operationalImpact: impact,
      severity,
      suspectedRootCause: r.actionTaken ? `Per remarks: ${r.actionTaken}`.slice(0, 100) : "Insufficient information",
      confidence: conf,
      rationale: `[Demo mode] Keyword match (score ${kw.score.toFixed(1)}) and legacy sheet "${r.legacyCategory}".`,
      categoryLocked: Boolean(r.lockedCategory),
    };
  });
}

/** Hashed bag-of-words (unigrams + bigrams) embedding, 256 dims. */
export function mockEmbed(texts: string[]): number[][] {
  const DIM = 256;
  return texts.map((t) => {
    const v = new Array(DIM).fill(0);
    const w = words(t.split("|")[0]);
    const grams = [...w, ...w.slice(1).map((x, i) => `${w[i]}_${x}`)];
    for (const g of grams) {
      let h = 2166136261;
      for (let i = 0; i < g.length; i++) h = Math.imul(h ^ g.charCodeAt(i), 16777619);
      v[(h >>> 0) % DIM] += g.includes("_") ? 0.6 : 1;
    }
    return v;
  });
}

function mostCommon(arr: string[]): string | undefined {
  const m = new Map<string, number>();
  for (const a of arr) m.set(a, (m.get(a) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

export function mockSummarise(clusters: SummariseRequest["clusters"]): (ClusterSummary & { clusterId: string })[] {
  return clusters.map((c) => {
    const fault = mostCommon(c.examples.map((e) => e.faultType ?? faultLabel(e.description))) ?? "Recurring fault";
    const loc = mostCommon(c.examples.flatMap((e) => (e.location ? [e.location] : [])));
    const action = mostCommon(c.examples.flatMap((e) => (e.actionTaken ? [e.actionTaken] : [])));
    return {
      clusterId: c.clusterId,
      clusterTitle: `${fault}${loc ? ` — ${loc}` : ""}`,
      consolidatedProblemStatement: `[Demo mode] ${c.examples.length}+ reports of "${fault.toLowerCase()}"${loc ? ` mainly at ${loc}` : ""} (${c.category}).`,
      likelyRootCause: action ? `Repeated rectification ("${action}") suggests an unresolved underlying cause.` : "Insufficient information",
      affectedSystemFunction: FUNCTION_BY_CATEGORY[c.category],
      recommendedAction: `Inspect and permanently rectify the ${c.category.toLowerCase()} fault${loc ? ` at ${loc}` : ""}; monitor for repeats.`,
    };
  });
}

export function mockLocations(locations: string[]): { location: string; criticality: Criticality; reason: string }[] {
  return locations.map((l) => {
    if (/server|data|comms|control|command|lobby|security|entrance|electrical|switch|plant|lift|fire exit|staircase/i.test(l)) {
      return { location: l, criticality: "High", reason: "[Demo] Critical space or circulation route" };
    }
    if (/store|back.of.house|car park|roof|garden|landscap|loading/i.test(l)) {
      return { location: l, criticality: "Low", reason: "[Demo] Low-occupancy or back-of-house area" };
    }
    return { location: l, criticality: "Medium", reason: "[Demo] Occupied office or amenity space" };
  });
}

export function mockDraftCr(c: DraftCrRequest["cluster"]): ChangeRequestAI {
  const trade = c.metrics.trades[0] ?? (c.category in CATEGORY_TRADE ? CATEGORY_TRADE[c.category as keyof typeof CATEGORY_TRADE] : "General Handyman");
  return {
    title: `Permanently rectify: ${c.title}`.slice(0, 120),
    problemStatement: `[Demo mode] ${c.metrics.recordCount} reports between ${c.metrics.firstSeen ?? "n/a"} and ${c.metrics.lastSeen ?? "n/a"} across ${c.metrics.distinctLocations} location(s). ${c.problemStatement}`,
    operationalImpact: `${c.metrics.operationalImpacts.join(", ") || "Service disruption"}; mean severity ${c.metrics.meanSeverity?.toFixed(1) ?? "n/a"}.`,
    suspectedRootCause: c.likelyRootCause,
    immediateFix: "Attend and rectify each open report; confirm the fault is cleared with the occupant.",
    permanentFix: c.recommendedAction,
    acceptanceCriteria: [
      "No repeat reports at the affected location(s) for 60 days",
      "All related jobs meet the 2 h response and 4 h turnaround SLA",
    ],
    trades: [trade],
    estimatedManHours: Math.max(2, Math.round(c.metrics.recordCount * 1.5)),
    effortNotes: "Indicative estimate generated in demo mode.",
  };
}

export function mockInsights(stats: Record<string, unknown>): string[] {
  const s = stats as Record<string, number | null | unknown>;
  return [
    `[Demo mode] ${s.totalRecords} records analysed; ${s.openRecords} remain open.`,
    `Response SLA met for ${s.responseSlaMetPct ?? "n/a"}% and turnaround SLA for ${s.tatSlaMetPct ?? "n/a"}% of records with timestamps.`,
    `${s.recurringIssueCount} recurring issues found, ${s.p1ClusterCount} of them priority P1.`,
    `${s.legacyOthersReclassified} of ${s.legacyOthers} legacy "Others" records were reclassified into specific categories.`,
  ];
}
