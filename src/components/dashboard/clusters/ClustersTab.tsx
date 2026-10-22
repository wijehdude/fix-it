"use client";

import { ChevronDown, ChevronRight, FileText, Loader2, Search } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AiMarker, CategoryLabel, EmptyState, PriorityBadge, ScoreWithBreakdown, fmtPct } from "@/components/common/bits";
import { Sparkline } from "@/components/common/Sparkline";
import { SCORING_CONFIG } from "@/config/scoring";
import { useFiltered } from "@/hooks/useAnalysis";
import type { ClusterView } from "@/lib/analysis/derive";
import { displayLocation } from "@/lib/analysis/locations";
import { percentile, round } from "@/lib/analysis/stats";
import { formatDate, formatDateTime, formatMonthKey } from "@/lib/parse/dates";
import { draftCr } from "@/lib/pipeline/orchestrator";
import { useAnalysisStore } from "@/store/useAnalysisStore";

export function ClusterScoreBadge({ c }: { c: ClusterView }) {
  const live = c.members.filter((m) => !m.isDuplicate);
  const p75 = percentile((live.length ? live : c.members).map((m) => m.score.score), SCORING_CONFIG.clusterPercentile) ?? 0;
  const mult = 1 + SCORING_CONFIG.clusterLocationBonusPerLocation * Math.min(SCORING_CONFIG.clusterLocationBonusMaxLocations, c.locations.length);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="cursor-help rounded" aria-label={`Cluster score ${round(c.score, 0)}, ${c.band}. Show breakdown`}>
          <PriorityBadge band={c.band} score={c.score} />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-left">
        <p className="font-semibold">
          Cluster score {round(c.score, 1)} → {c.band}
        </p>
        <p className="tabular-nums">
          P75 of {live.length} member scores = {round(p75, 1)}
        </p>
        <p className="tabular-nums">
          × location spread {round(mult, 2)} ({c.locations.length} location{c.locations.length === 1 ? "" : "s"}, capped at 100)
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

function ClusterDetail({ c }: { c: ClusterView }) {
  const cr = useAnalysisStore((s) => s.crs[c.id]);
  const inFlight = useAnalysisStore((s) => s.crInFlight[c.id]);
  const crError = useAnalysisStore((s) => s.crErrors[c.id]);
  const set = useAnalysisStore((s) => s.set);
  const members = [...c.members].sort((a, b) => (b.reportedAt?.getTime() ?? 0) - (a.reportedAt?.getTime() ?? 0));
  return (
    <div className="space-y-4 bg-muted/30 p-4">
      {c.summary ? (
        <dl className="grid gap-4 md:grid-cols-3">
          <div>
            <dt className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
              Consolidated problem statement <AiMarker text="Generated from up to 8 representative reports in this cluster." />
            </dt>
            <dd className="mt-1 text-sm">{c.summary.consolidatedProblemStatement}</dd>
          </div>
          <div>
            <dt className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
              Likely root cause (to be verified) <AiMarker text="AI hypothesis based on the reports and rectification remarks." />
            </dt>
            <dd className="mt-1 text-sm">{c.summary.likelyRootCause}</dd>
          </div>
          <div>
            <dt className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
              Recommended action <AiMarker text="AI-suggested engineering or maintenance action." />
            </dt>
            <dd className="mt-1 text-sm">{c.summary.recommendedAction}</dd>
          </div>
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground">
          {c.isRecurring ? "Summary not available yet (retry failed batches to generate it)." : "Not a recurring issue, so no AI summary was generated."}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {cr ? (
          <Button size="sm" variant="outline" onClick={() => set({ activeTab: "crs", expandedClusterId: c.id })}>
            <FileText /> View {cr.crId}
          </Button>
        ) : (
          <Button size="sm" onClick={() => void draftCr(c)} disabled={inFlight}>
            {inFlight ? <Loader2 className="animate-spin" /> : <FileText />} {inFlight ? "Drafting CR…" : "Generate CR"}
          </Button>
        )}
        {crError && <span className="text-xs text-destructive">{crError}</span>}
        <span className="text-xs text-muted-foreground">
          Locations: {c.locations.map(displayLocation).join(", ") || "none recorded"}
        </span>
      </div>
      <div className="overflow-x-auto rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Reported</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Fault type</TableHead>
              <TableHead>Action taken</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Score</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((m) => (
              <TableRow key={m.id} className={m.isDuplicate ? "opacity-60" : undefined}>
                <TableCell className="text-xs tabular-nums">{formatDateTime(m.reportedAt)}</TableCell>
                <TableCell className="max-w-sm text-xs whitespace-normal">
                  {m.description}
                  {m.isDuplicate && <span className="ml-1 rounded bg-muted px-1 text-[10px]">duplicate</span>}
                  {m.isLocationRepeat && <span className="ml-1 rounded bg-muted px-1 text-[10px]">repeat at location</span>}
                </TableCell>
                <TableCell className="text-xs">{m.location ?? "—"}</TableCell>
                <TableCell className="text-xs">{m.cls?.faultType ?? "—"}</TableCell>
                <TableCell className="max-w-xs text-xs whitespace-normal text-muted-foreground">{m.actionTaken ?? "—"}</TableCell>
                <TableCell className="text-xs whitespace-nowrap">
                  {m.sourceSheet} r{m.sourceRow}
                </TableCell>
                <TableCell>
                  <ScoreWithBreakdown b={m.score} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export function ClustersTab() {
  const { clusters, derived } = useFiltered();
  const expandedId = useAnalysisStore((s) => s.expandedClusterId);
  const set = useAnalysisStore((s) => s.set);
  const crs = useAnalysisStore((s) => s.crs);
  const [recurringOnly, setRecurringOnly] = useState(true);
  const [query, setQuery] = useState("");
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return clusters
      .filter((c) => !recurringOnly || c.isRecurring)
      .filter((c) => !q || `${c.title} ${c.category} ${c.systemFunction} ${c.locations.join(" ")}`.toLowerCase().includes(q));
  }, [clusters, recurringOnly, query]);

  // Scroll to a cluster opened from another tab.
  useEffect(() => {
    if (expandedId) rowRefs.current.get(expandedId)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [expandedId]);

  if (!derived.clusters.length) {
    return (
      <EmptyState title="No clusters yet">
        <p>Clusters appear after classification and embedding finish. If a stage failed, use “Retry failed batches”.</p>
      </EmptyState>
    );
  }

  const recurringCount = clusters.filter((c) => c.isRecurring).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <div>
          <h2 className="text-lg font-semibold">Recurring issues</h2>
          <p className="text-sm text-muted-foreground">
            {recurringCount} recurring issue{recurringCount === 1 ? "" : "s"} (≥ {useAnalysisStore.getState().settings.minRecurringSize} reports describing the same
            underlying problem), ranked by cluster priority.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch id="recurring-only" checked={recurringOnly} onCheckedChange={setRecurringOnly} />
            <Label htmlFor="recurring-only">Recurring only</Label>
          </div>
          <div className="relative w-56">
            <Search className="absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input className="h-8 pl-8" placeholder="Search clusters" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search clusters" />
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Priority</TableHead>
              <TableHead className="min-w-64">Issue</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>System function</TableHead>
              <TableHead className="text-right">Reports</TableHead>
              <TableHead className="text-right">Locations</TableHead>
              <TableHead>First / last seen</TableHead>
              <TableHead>Trend</TableHead>
              <TableHead className="text-right">Mean severity</TableHead>
              <TableHead className="text-right">SLA breach</TableHead>
              <TableHead>CR</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((c) => {
              const open = expandedId === c.id;
              return (
                <Fragment key={c.id}>
                  <TableRow
                    ref={(el) => {
                      if (el) rowRefs.current.set(c.id, el);
                    }}
                    className="cursor-pointer"
                    onClick={() => set({ expandedClusterId: open ? null : c.id })}
                    aria-expanded={open}
                  >
                    <TableCell>
                      <button
                        type="button"
                        aria-label={open ? `Collapse ${c.title}` : `Expand ${c.title}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          set({ expandedClusterId: open ? null : c.id });
                        }}
                      >
                        {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                      </button>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <ClusterScoreBadge c={c} />
                    </TableCell>
                    <TableCell className="max-w-md whitespace-normal">
                      <span className="inline-flex items-start gap-1.5 font-medium">
                        {c.title}
                        {c.summary && <AiMarker text="Title generated by AI from the cluster's reports." />}
                      </span>
                    </TableCell>
                    <TableCell>
                      <CategoryLabel category={c.category} sub={c.othersSubTheme} />
                    </TableCell>
                    <TableCell className="text-xs">{c.systemFunction}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.count}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.locations.length}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap tabular-nums">
                      {formatDate(c.firstSeen)}
                      <br />
                      {formatDate(c.lastSeen)}
                    </TableCell>
                    <TableCell>
                      <Sparkline values={c.monthly.map((m) => m.count)} labels={c.monthly.map((m) => formatMonthKey(m.month))} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{c.meanSeverity === undefined ? "n/a" : round(c.meanSeverity, 1)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtPct(c.slaBreachRate)}</TableCell>
                    <TableCell className="text-xs">{crs[c.id]?.crId ?? "—"}</TableCell>
                  </TableRow>
                  {open && (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={12} className="p-0 whitespace-normal">
                        <ClusterDetail c={c} />
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
            {!rows.length && (
              <TableRow>
                <TableCell colSpan={12} className="py-8 text-center text-muted-foreground">
                  No clusters match the current filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
