import type { ClusterView } from "@/lib/analysis/derive";
import { displayLocation } from "@/lib/analysis/locations";
import { mean, round } from "@/lib/analysis/stats";
import { formatDate } from "@/lib/parse/dates";
import type { ChangeRequest } from "@/lib/types";

/** Deterministic evidence block built from the records themselves (never from the AI). */
export function crEvidence(c: ClusterView) {
  const live = c.members.filter((m) => !m.isDuplicate);
  const quotes = [...live]
    .sort((a, b) => b.score.score - a.score.score)
    .filter((m, i, arr) => arr.findIndex((x) => x.description.toLowerCase() === m.description.toLowerCase()) === i)
    .slice(0, 3)
    .map((m) => ({ text: m.description, ref: `${m.sourceSheet} row ${m.sourceRow}`, date: formatDate(m.reportedAt) }));
  const breakdown = {
    impact: mean(live.map((m) => m.score.contributions.impact)) ?? 0,
    frequency: mean(live.map((m) => m.score.contributions.frequency)) ?? 0,
    location: mean(live.map((m) => m.score.contributions.location)) ?? 0,
    sla: mean(live.map((m) => m.score.contributions.sla)) ?? 0,
  };
  return {
    reports: live.length,
    dateRange: c.firstSeen ? `${formatDate(c.firstSeen)} – ${formatDate(c.lastSeen)}` : "n/a",
    locations: c.locations.map(displayLocation),
    quotes,
    slaBreach: c.slaBreachRate === undefined ? "n/a" : `${Math.round(c.slaBreachRate * 100)}%`,
    repeatLocationRecords: c.repeatLocationCount,
    breakdown,
  };
}

function priorityLine(c: ClusterView): string {
  const e = crEvidence(c).breakdown;
  return `${c.band} (score ${round(c.score, 0)}; avg member contributions — impact ${round(e.impact, 1)}, frequency ${round(e.frequency, 1)}, location ${round(e.location, 1)}, SLA ${round(e.sla, 1)})`;
}

export function crToText(cr: ChangeRequest, c: ClusterView): string {
  const ev = crEvidence(c);
  const lines = [
    `${cr.crId} — ${cr.title}`,
    ``,
    `Category / sub-theme: ${c.category}${c.othersSubTheme ? ` / ${c.othersSubTheme}` : ""}`,
    `Affected system function: ${c.systemFunction}`,
    ``,
    `Problem statement:`,
    cr.problemStatement,
    ``,
    `Evidence:`,
    `- ${ev.reports} linked reports, ${ev.dateRange}`,
    `- Locations: ${ev.locations.join(", ") || "not recorded"}`,
    `- SLA breach rate: ${ev.slaBreach}; repeat-at-location records: ${ev.repeatLocationRecords}`,
    ...ev.quotes.map((q) => `- "${q.text}" (${q.ref}, ${q.date})`),
    ``,
    `Operational impact:`,
    cr.operationalImpact,
    ``,
    `Suspected root cause (to be verified):`,
    cr.suspectedRootCause,
    ``,
    `Proposed change / rectification:`,
    `- Immediate fix: ${cr.immediateFix}`,
    `- Permanent fix: ${cr.permanentFix}`,
    ``,
    `Acceptance criteria:`,
    ...cr.acceptanceCriteria.map((a) => `- ${a}`),
    ``,
    `Priority: ${priorityLine(c)}`,
    `Estimated effort / trade: ${cr.trades.join(", ") || "n/a"}; ~${cr.estimatedManHours} man-hours. ${cr.effortNotes}`,
  ];
  return lines.join("\n");
}

export function crToMarkdown(cr: ChangeRequest, c: ClusterView): string {
  const ev = crEvidence(c);
  const row = (k: string, v: string) => `| ${k} | ${v.replace(/\|/g, "\\|").replace(/\n/g, "<br>")} |`;
  return [
    `## ${cr.crId}: ${cr.title}`,
    ``,
    `| Field | Content |`,
    `|---|---|`,
    row("CR ID", cr.crId),
    row("Title", cr.title),
    row("Category / Sub-theme", `${c.category}${c.othersSubTheme ? ` / ${c.othersSubTheme}` : ""}`),
    row("Affected system function", c.systemFunction),
    row("Problem statement", cr.problemStatement),
    row(
      "Evidence",
      [
        `${ev.reports} linked reports, ${ev.dateRange}`,
        `Locations: ${ev.locations.join(", ") || "not recorded"}`,
        `SLA breach rate: ${ev.slaBreach}`,
        ...ev.quotes.map((q) => `“${q.text}” (${q.ref})`),
      ].join("\n"),
    ),
    row("Operational impact", cr.operationalImpact),
    row("Suspected root cause", `${cr.suspectedRootCause} *(to be verified)*`),
    row("Proposed change / rectification", `**Immediate:** ${cr.immediateFix}\n**Permanent:** ${cr.permanentFix}`),
    row("Acceptance criteria", cr.acceptanceCriteria.map((a) => `• ${a}`).join("\n")),
    row("Priority", priorityLine(c)),
    row("Estimated effort / trade", `${cr.trades.join(", ") || "n/a"} · ~${cr.estimatedManHours} man-hours. ${cr.effortNotes}`),
  ].join("\n");
}
