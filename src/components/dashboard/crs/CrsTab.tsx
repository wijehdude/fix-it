"use client";

import { Check, Copy, FileText, Loader2, Pencil, RefreshCw, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AiMarker, CategoryLabel, EmptyState, Spinner } from "@/components/common/bits";
import { ClusterScoreBadge } from "@/components/dashboard/clusters/ClustersTab";
import { useFiltered } from "@/hooks/useAnalysis";
import type { ClusterView } from "@/lib/analysis/derive";
import { crEvidence, crToMarkdown, crToText } from "@/lib/crFormat";
import { draftCr, draftCrs } from "@/lib/pipeline/orchestrator";
import type { ChangeRequest } from "@/lib/types";
import { useAnalysisStore } from "@/store/useAnalysisStore";

function CopyButton({ label, getText }: { label: string; getText: () => string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(getText());
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          /* clipboard blocked */
        }
      }}
    >
      {done ? <Check /> : <Copy />} {done ? "Copied" : label}
    </Button>
  );
}

type Draft = Omit<ChangeRequest, "acceptanceCriteria" | "trades"> & { acceptanceCriteria: string; trades: string };

function Field({ label, ai, children }: { label: string; ai?: boolean; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 border-t py-2.5 md:grid-cols-[200px_1fr] md:gap-4">
      <dt className="flex items-start gap-1 text-xs font-semibold text-muted-foreground">
        {label}
        {ai && <AiMarker text="Drafted by AI from the cluster summary, metrics and example records. Review before use." />}
      </dt>
      <dd className="text-sm whitespace-pre-wrap">{children}</dd>
    </div>
  );
}

function CrCard({ cr, cluster }: { cr: ChangeRequest; cluster: ClusterView }) {
  const updateCr = useAnalysisStore((s) => s.updateCr);
  const inFlight = useAnalysisStore((s) => s.crInFlight[cluster.id]);
  const expandedId = useAnalysisStore((s) => s.expandedClusterId);
  const ref = useRef<HTMLElement>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const ev = crEvidence(cluster);

  useEffect(() => {
    if (expandedId === cluster.id) ref.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [expandedId, cluster.id]);

  const startEdit = () => setDraft({ ...cr, acceptanceCriteria: cr.acceptanceCriteria.join("\n"), trades: cr.trades.join(", ") });
  const save = () => {
    if (!draft) return;
    updateCr(cluster.id, {
      ...draft,
      acceptanceCriteria: draft.acceptanceCriteria.split("\n").map((s) => s.trim()).filter(Boolean),
      trades: draft.trades.split(",").map((s) => s.trim()).filter(Boolean),
      estimatedManHours: Number(draft.estimatedManHours) || 0,
    });
    setDraft(null);
  };
  const text = (k: keyof Draft, rows = 3) =>
    draft && (
      <Textarea
        aria-label={k}
        rows={rows}
        value={String(draft[k] ?? "")}
        onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
      />
    );

  return (
    <article ref={ref} className="rounded-xl border bg-card p-5 shadow-xs" aria-labelledby={`cr-${cr.crId}`}>
      <header className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-muted-foreground tabular-nums">
            {cr.crId}
            {cr.edited && <span className="ml-2 text-[var(--accent-brand)]">EDITED</span>}
          </p>
          {draft ? (
            <Input aria-label="Title" className="mt-1" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          ) : (
            <h3 id={`cr-${cr.crId}`} className="mt-0.5 text-base font-semibold">
              {cr.title}
            </h3>
          )}
        </div>
        <ClusterScoreBadge c={cluster} />
        <div className="flex flex-wrap gap-2">
          {draft ? (
            <>
              <Button size="sm" onClick={save}>
                <Check /> Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>
                <X /> Cancel
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={startEdit}>
                <Pencil /> Edit
              </Button>
              <CopyButton label="Copy as text" getText={() => crToText(cr, cluster)} />
              <CopyButton label="Copy as Markdown" getText={() => crToMarkdown(cr, cluster)} />
              <Button size="sm" variant="ghost" disabled={inFlight} onClick={() => void draftCr(cluster)} title="Re-draft with the AI (replaces edits)">
                {inFlight ? <Loader2 className="animate-spin" /> : <RefreshCw />} Re-draft
              </Button>
            </>
          )}
        </div>
      </header>
      <dl className="mt-3">
        <Field label="Category / Sub-theme">
          <CategoryLabel category={cluster.category} sub={cluster.othersSubTheme} />
        </Field>
        <Field label="Affected system function">{cluster.systemFunction}</Field>
        <Field label="Problem statement" ai>
          {draft ? text("problemStatement", 4) : cr.problemStatement}
        </Field>
        <Field label="Evidence">
          <ul className="space-y-1">
            <li>
              <strong className="tabular-nums">{ev.reports}</strong> linked reports, {ev.dateRange}
            </li>
            <li>Locations: {ev.locations.join(", ") || "not recorded"}</li>
            <li>
              SLA breach rate: <span className="tabular-nums">{ev.slaBreach}</span> · repeat-at-location records:{" "}
              <span className="tabular-nums">{ev.repeatLocationRecords}</span>
            </li>
            {ev.quotes.map((q) => (
              <li key={q.ref} className="border-l-2 pl-2 text-muted-foreground italic">
                “{q.text}” <span className="not-italic">({q.ref}, {q.date})</span>
              </li>
            ))}
          </ul>
        </Field>
        <Field label="Operational impact" ai>
          {draft ? text("operationalImpact") : cr.operationalImpact}
        </Field>
        <Field label="Suspected root cause" ai>
          {draft ? text("suspectedRootCause") : (
            <>
              {cr.suspectedRootCause} <span className="text-xs font-medium text-muted-foreground">(to be verified)</span>
            </>
          )}
        </Field>
        <Field label="Proposed change / rectification" ai>
          {draft ? (
            <div className="space-y-2">
              <label className="block text-xs">Immediate fix{text("immediateFix")}</label>
              <label className="block text-xs">Permanent fix{text("permanentFix")}</label>
            </div>
          ) : (
            <div className="space-y-1.5">
              <p>
                <strong>Immediate fix:</strong> {cr.immediateFix}
              </p>
              <p>
                <strong>Permanent fix:</strong> {cr.permanentFix}
              </p>
            </div>
          )}
        </Field>
        <Field label="Acceptance criteria" ai>
          {draft ? (
            <>
              {text("acceptanceCriteria", 4)}
              <span className="text-xs text-muted-foreground">One criterion per line.</span>
            </>
          ) : (
            <ul className="list-disc pl-4">
              {cr.acceptanceCriteria.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          )}
        </Field>
        <Field label="Priority">
          {cluster.band} · score <span className="tabular-nums">{Math.round(cluster.score)}</span> · average member contributions: impact{" "}
          {ev.breakdown.impact.toFixed(1)}, frequency {ev.breakdown.frequency.toFixed(1)}, location {ev.breakdown.location.toFixed(1)}, SLA{" "}
          {ev.breakdown.sla.toFixed(1)}
        </Field>
        <Field label="Estimated effort / trade" ai>
          {draft ? (
            <div className="grid gap-2 md:grid-cols-3">
              <Input aria-label="Trades (comma separated)" value={draft.trades} onChange={(e) => setDraft({ ...draft, trades: e.target.value })} />
              <Input
                aria-label="Estimated man-hours"
                type="number"
                min={0}
                step={0.5}
                value={draft.estimatedManHours}
                onChange={(e) => setDraft({ ...draft, estimatedManHours: Number(e.target.value) })}
              />
              <Input aria-label="Effort notes" value={draft.effortNotes} onChange={(e) => setDraft({ ...draft, effortNotes: e.target.value })} />
            </div>
          ) : (
            <>
              {cr.trades.join(", ") || "n/a"} · ~<span className="tabular-nums">{cr.estimatedManHours}</span> man-hours (indicative). {cr.effortNotes}
            </>
          )}
        </Field>
      </dl>
    </article>
  );
}

export function CrsTab() {
  const { derived, clusters } = useFiltered();
  const crs = useAnalysisStore((s) => s.crs);
  const crErrors = useAnalysisStore((s) => s.crErrors);
  const inFlight = useAnalysisStore((s) => s.crInFlight);
  const progress = useAnalysisStore((s) => s.progress.crs);
  const [query, setQuery] = useState("");

  const visibleIds = useMemo(() => new Set(clusters.map((c) => c.id)), [clusters]);
  const cards = useMemo(() => {
    const q = query.trim().toLowerCase();
    return derived.clusters
      .filter((c) => crs[c.id] && visibleIds.has(c.id))
      .filter((c) => !q || `${crs[c.id].crId} ${crs[c.id].title} ${crs[c.id].problemStatement} ${c.category} ${c.systemFunction}`.toLowerCase().includes(q));
  }, [derived.clusters, crs, visibleIds, query]);
  const missing = derived.clusters.filter((c) => c.isRecurring && (c.band === "P1" || c.band === "P2") && !crs[c.id]);
  const failed = derived.clusters.filter((c) => crErrors[c.id] && !crs[c.id]);
  const orphaned = Object.values(crs).filter((cr) => !derived.clusterById.has(cr.clusterId)).length;
  const drafting = Object.keys(inFlight).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h2 className="text-lg font-semibold">Change requests</h2>
          <p className="text-sm text-muted-foreground">
            Auto-drafted for every P1 and P2 recurring issue, in the standard CR format. Edits are kept for this session only.
          </p>
        </div>
        {drafting > 0 && <Spinner label={`Drafting ${drafting}… (${progress.done}/${progress.total})`} />}
        {missing.length > 0 && (
          <Button size="sm" onClick={() => void draftCrs(missing)} disabled={drafting > 0}>
            <FileText /> Draft {missing.length} missing P1/P2 CR{missing.length === 1 ? "" : "s"}
          </Button>
        )}
        <div className="relative w-56">
          <Search className="absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input className="h-8 pl-8" placeholder="Search CRs" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search change requests" />
        </div>
      </div>

      {failed.length > 0 && (
        <div className="rounded-lg border border-destructive/40 p-3 text-sm" role="alert">
          <p className="font-medium">{failed.length} CR draft{failed.length === 1 ? "" : "s"} failed.</p>
          <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
            {failed.slice(0, 5).map((c) => (
              <li key={c.id}>
                {c.title}: {crErrors[c.id]}
              </li>
            ))}
          </ul>
          <Button size="sm" variant="outline" className="mt-2" onClick={() => void draftCrs(failed)} disabled={drafting > 0}>
            <RefreshCw /> Retry failed drafts
          </Button>
        </div>
      )}
      {orphaned > 0 && (
        <p className="text-xs text-muted-foreground">
          {orphaned} earlier CR{orphaned === 1 ? " belongs" : "s belong"} to clusters that changed after re-clustering and {orphaned === 1 ? "is" : "are"} hidden.
        </p>
      )}

      {cards.length ? (
        <div className="space-y-4">
          {cards.map((c) => (
            <CrCard key={c.id} cr={crs[c.id]} cluster={c} />
          ))}
        </div>
      ) : drafting > 0 ? (
        <EmptyState title="Drafting change requests…" icon={<Loader2 className="size-6 animate-spin" aria-hidden />} />
      ) : (
        <EmptyState title="No change requests yet">
          <p>CRs are drafted for P1/P2 recurring issues. Use “Generate CR” on any cluster in the Recurring Issues tab to draft one for another issue.</p>
        </EmptyState>
      )}
    </div>
  );
}
