"use client";

import { Repeat, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CategoryLabel, EmptyState, PriorityBadge, ScoreWithBreakdown, fmtHours } from "@/components/common/bits";
import { CriticalityLabel } from "@/components/locations/LocationCriticalityTable";
import { PRIORITY_BAND_LIST, type PriorityBand } from "@/config/scoring";
import { useFiltered } from "@/hooks/useAnalysis";
import type { EnrichedRecord } from "@/lib/analysis/derive";
import { formatDateTime } from "@/lib/parse/dates";
import { useAnalysisStore } from "@/store/useAnalysisStore";
import { cn } from "@/lib/utils";

const PAGE = 50;

export function slaText(r: EnrichedRecord): { text: string; breached: boolean } {
  const s = r.sla;
  if (s.turnaroundMet === false) return { text: `TAT ${fmtHours(s.turnaroundHours)} (> 4 h)`, breached: true };
  if (s.isOpen && s.openBreached) return { text: `Open ${fmtHours(s.ageHours, 0)}`, breached: true };
  if (s.responseMet === false) return { text: `Response ${fmtHours(s.responseHours)} (> 2 h)`, breached: true };
  if (s.turnaroundMet === true) return { text: `Met (TAT ${fmtHours(s.turnaroundHours)})`, breached: false };
  if (s.isOpen && s.openBreached === false) return { text: `Open ${fmtHours(s.ageHours)}`, breached: false };
  return { text: "n/a", breached: false };
}

export function QueueTab() {
  const { live } = useFiltered();
  const set = useAnalysisStore((s) => s.set);
  const [bands, setBands] = useState<PriorityBand[]>([]);
  const [openOnly, setOpenOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);

  const ranked = useMemo(() => [...live].sort((a, b) => b.score.score - a.score.score), [live]);
  const counts = useMemo(() => {
    const c: Record<PriorityBand, number> = { P1: 0, P2: 0, P3: 0, P4: 0 };
    for (const r of ranked) c[r.score.band]++;
    return c;
  }, [ranked]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ranked
      .filter((r) => !bands.length || bands.includes(r.score.band))
      .filter((r) => !openOnly || r.sla.isOpen)
      .filter((r) => !q || `${r.description} ${r.location ?? ""} ${r.cls?.faultType ?? ""} ${r.trade}`.toLowerCase().includes(q));
  }, [ranked, bands, openOnly, query]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const current = Math.min(page, pages - 1);

  if (!live.length) return <EmptyState title="No records match the current filters" />;

  const toggleBand = (b: PriorityBand) => {
    setBands((cur) => (cur.includes(b) ? cur.filter((x) => x !== b) : [...cur, b]));
    setPage(0);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h2 className="text-lg font-semibold">Priority queue</h2>
          <p className="text-sm text-muted-foreground">Every record ranked by priority score — the dispatch list. Hover a score for its breakdown.</p>
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by priority band">
          {PRIORITY_BAND_LIST.map((b) => (
            <button
              key={b}
              type="button"
              aria-pressed={bands.includes(b)}
              onClick={() => toggleBand(b)}
              className={cn("rounded-full", bands.includes(b) ? "ring-2 ring-ring" : "opacity-80 hover:opacity-100")}
            >
              <PriorityBadge band={b} className="py-1" />
              <span className="sr-only">{counts[b]} records</span>
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">
          P1 {counts.P1} · P2 {counts.P2} · P3 {counts.P3} · P4 {counts.P4}
        </span>
        <Button size="sm" variant={openOnly ? "secondary" : "outline"} aria-pressed={openOnly} onClick={() => (setOpenOnly(!openOnly), setPage(0))}>
          Open only
        </Button>
        <div className="relative w-56">
          <Search className="absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input className="h-8 pl-8" placeholder="Search" value={query} onChange={(e) => (setQuery(e.target.value), setPage(0))} aria-label="Search the queue" />
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 text-right">#</TableHead>
              <TableHead>Score</TableHead>
              <TableHead className="min-w-72">Defect</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Reported</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>SLA</TableHead>
              <TableHead>Trade</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.slice(current * PAGE, current * PAGE + PAGE).map((r, i) => {
              const sla = slaText(r);
              const cluster = r.clusterId && r.clusterSize > 1 ? r.clusterId : undefined;
              return (
                <TableRow key={r.id}>
                  <TableCell className="text-right text-muted-foreground tabular-nums">{current * PAGE + i + 1}</TableCell>
                  <TableCell>
                    <ScoreWithBreakdown b={r.score} />
                  </TableCell>
                  <TableCell className="max-w-md whitespace-normal">
                    <p className="text-sm">{r.description}</p>
                    <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                      {r.cls && <span>Severity {r.cls.severity} · {r.cls.operationalImpact}</span>}
                      {cluster && (
                        <button className="inline-flex items-center gap-0.5 underline" onClick={() => set({ activeTab: "clusters", expandedClusterId: cluster })}>
                          <Repeat className="size-3" aria-hidden /> {r.clusterSize} similar
                        </button>
                      )}
                      {r.isLocationRepeat && <span>repeat at same location</span>}
                    </p>
                  </TableCell>
                  <TableCell>
                    <CategoryLabel category={r.category} />
                  </TableCell>
                  <TableCell className="text-xs whitespace-normal">
                    {r.location ?? "—"}
                    <div className="text-muted-foreground">
                      <CriticalityLabel level={r.criticality} />
                    </div>
                  </TableCell>
                  <TableCell className="text-xs whitespace-nowrap tabular-nums">{formatDateTime(r.reportedAt)}</TableCell>
                  <TableCell className="text-xs">{r.statusNormalised}</TableCell>
                  <TableCell className={cn("text-xs whitespace-nowrap", sla.breached && "font-medium text-[var(--status-critical)]")}>
                    {sla.breached && <span aria-hidden>⚠ </span>}
                    {sla.text}
                  </TableCell>
                  <TableCell className="text-xs">{r.trade}</TableCell>
                </TableRow>
              );
            })}
            {!rows.length && (
              <TableRow>
                <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                  No records match.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <span className="mr-auto text-muted-foreground tabular-nums">{rows.length.toLocaleString()} records</span>
          <Button size="sm" variant="outline" disabled={current === 0} onClick={() => setPage(current - 1)}>
            Previous
          </Button>
          <span className="tabular-nums">
            Page {current + 1} of {pages}
          </span>
          <Button size="sm" variant="outline" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
