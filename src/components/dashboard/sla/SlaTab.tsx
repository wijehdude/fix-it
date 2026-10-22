"use client";

import { AlertTriangle } from "lucide-react";
import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CategoryLabel, ChartCard, EmptyState, KpiTile, NotAvailable, ScoreWithBreakdown, fmtHours } from "@/components/common/bits";
import { AXIS_PROPS, BAR_RADIUS, GRID_STROKE, HBAR_RADIUS, TooltipBox } from "@/components/common/chart";
import { CATEGORIES } from "@/config/categories";
import { SLA_CONFIG } from "@/config/sla";
import { useFiltered } from "@/hooks/useAnalysis";
import { displayLocation } from "@/lib/analysis/locations";
import { median } from "@/lib/analysis/stats";
import type { EnrichedRecord } from "@/lib/analysis/derive";
import { formatDateTime, formatMonthKey, monthKey } from "@/lib/parse/dates";
import { useAnalysisStore, type Filters } from "@/store/useAnalysisStore";
import { groupCompliance, histogram, type ComplianceRow } from "./slaStats";

const RESP_COLOR = "var(--seq-3)";
const TAT_COLOR = "var(--seq-6)";

function pctText(v: number | undefined): string {
  return v === undefined ? "n/a" : `${Math.round(v)}%`;
}

function SeriesLegend() {
  return (
    <ul className="flex gap-4 text-xs text-muted-foreground" aria-label="Legend">
      <li className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-[3px]" style={{ background: RESP_COLOR }} aria-hidden />
        Response ≤ {SLA_CONFIG.responseHours} h
      </li>
      <li className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-[3px]" style={{ background: TAT_COLOR }} aria-hidden />
        Turnaround ≤ {SLA_CONFIG.turnaroundHours} h
      </li>
    </ul>
  );
}

function ComplianceTooltip({ active, payload }: { active?: boolean; payload?: { payload?: ComplianceRow }[] }) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <TooltipBox
      title={row.label}
      rows={[
        { label: "Response met", value: `${pctText(row.respPct)} (${row.respMet}/${row.respKnown})`, color: RESP_COLOR },
        { label: "TAT met", value: `${pctText(row.tatPct)} (${row.tatMet}/${row.tatKnown})`, color: TAT_COLOR },
        { label: "Records", value: row.total },
      ]}
    />
  );
}

/** Grouped bars of % met (response vs TAT). Clicking a group toggles `filterKey` if given. */
function ComplianceChart({
  rows,
  horizontal = false,
  filterKey,
  height = 260,
}: {
  rows: ComplianceRow[];
  horizontal?: boolean;
  filterKey?: keyof Pick<Filters, "categories" | "trades" | "locations">;
  height?: number;
}) {
  const toggle = useAnalysisStore((s) => s.toggleFilter);
  if (!rows.length) return <EmptyState title="No data for the current filters" />;
  const onClick = filterKey
    ? (d: { payload?: ComplianceRow }) => {
        if (d.payload) toggle(filterKey, d.payload.key as never);
      }
    : undefined;
  const cursor = filterKey ? "pointer" : undefined;
  return (
    <div className="space-y-2">
      <SeriesLegend />
      <ResponsiveContainer width="100%" height={height}>
        {horizontal ? (
          <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }} barGap={2}>
            <CartesianGrid stroke={GRID_STROKE} horizontal={false} />
            <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} {...AXIS_PROPS} />
            <YAxis type="category" dataKey="label" width={150} interval={0} {...AXIS_PROPS} />
            <Tooltip content={<ComplianceTooltip />} cursor={{ fill: "var(--muted)", opacity: 0.5 }} />
            <Bar dataKey="respPct" name="Response" fill={RESP_COLOR} radius={HBAR_RADIUS} maxBarSize={10} onClick={onClick} cursor={cursor} />
            <Bar dataKey="tatPct" name="TAT" fill={TAT_COLOR} radius={HBAR_RADIUS} maxBarSize={10} onClick={onClick} cursor={cursor} />
          </BarChart>
        ) : (
          <BarChart data={rows} margin={{ left: 0, right: 8, top: 4, bottom: 4 }} barGap={2}>
            <CartesianGrid stroke={GRID_STROKE} vertical={false} />
            <XAxis dataKey="label" interval={0} angle={-30} textAnchor="end" height={70} {...AXIS_PROPS} tick={{ ...AXIS_PROPS.tick, fontSize: 10 }} />
            <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} width={40} {...AXIS_PROPS} />
            <Tooltip content={<ComplianceTooltip />} cursor={{ fill: "var(--muted)", opacity: 0.5 }} />
            <Bar dataKey="respPct" name="Response" fill={RESP_COLOR} radius={BAR_RADIUS} maxBarSize={18} onClick={onClick} cursor={cursor} />
            <Bar dataKey="tatPct" name="TAT" fill={TAT_COLOR} radius={BAR_RADIUS} maxBarSize={18} onClick={onClick} cursor={cursor} />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

function Histogram({ values, target, label }: { values: number[]; target: number; label: string }) {
  const data = useMemo(() => histogram(values), [values]);
  const targetBin = data.find((b) => b.lo === target)?.label;
  if (!values.length) return <NotAvailable reason={`No records with both a reported and a ${label.toLowerCase()} timestamp.`} />;
  return (
    <div className="space-y-2">
      <ul className="flex gap-4 text-xs text-muted-foreground" aria-label="Legend">
        <li className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px]" style={{ background: "var(--seq-4)" }} aria-hidden />
          Within {target} h
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px]" style={{ background: "var(--status-serious)" }} aria-hidden />
          Over {target} h
        </li>
      </ul>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ left: 0, right: 8, top: 16, bottom: 4 }} barCategoryGap={2}>
          <CartesianGrid stroke={GRID_STROKE} vertical={false} />
          <XAxis dataKey="label" interval={0} {...AXIS_PROPS} tick={{ ...AXIS_PROPS.tick, fontSize: 10 }} />
          <YAxis allowDecimals={false} width={36} {...AXIS_PROPS} />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.5 }}
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload as { label: string; count: number } | undefined;
              if (!active || !p) return null;
              return <TooltipBox title={`${p.label} h`} rows={[{ label: "Records", value: p.count }]} />;
            }}
          />
          <Bar dataKey="count" name="Records" radius={BAR_RADIUS}>
            {data.map((b) => (
              <Cell key={b.label} fill={b.lo >= target ? "var(--status-serious)" : "var(--seq-4)"} />
            ))}
          </Bar>
          {targetBin && (
            <ReferenceLine
              x={targetBin}
              position="start"
              stroke="var(--foreground)"
              strokeDasharray="4 3"
              label={{ value: `${target} h target`, position: "top", fill: "var(--viz-ink)", fontSize: 11 }}
            />
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Hours over target: TAT if completed, else age if open. */
function breachHours(r: EnrichedRecord): number | undefined {
  if (r.sla.turnaroundMet === false && r.sla.turnaroundHours !== undefined) return r.sla.turnaroundHours;
  if (r.sla.isOpen && r.sla.openBreached && r.sla.ageHours !== undefined) return r.sla.ageHours;
  return undefined;
}

export function SlaTab() {
  const { live } = useFiltered();
  const toggle = useAnalysisStore((s) => s.toggleFilter);

  const stats = useMemo(() => {
    const timed = live.filter((r) => r.reportedAt);
    const resp = live.flatMap((r) => (r.sla.responseHours !== undefined ? [r.sla.responseHours] : []));
    const tat = live.flatMap((r) => (r.sla.turnaroundHours !== undefined ? [r.sla.turnaroundHours] : []));
    const respMet = live.filter((r) => r.sla.responseMet).length;
    const tatMet = live.filter((r) => r.sla.turnaroundMet).length;
    const openBreached = live.filter((r) => r.sla.isOpen && r.sla.openBreached).length;
    const openKnown = live.filter((r) => r.sla.isOpen && r.sla.ageHours !== undefined).length;
    const dq = live.filter((r) => r.sla.dataQualityIssue).length;

    const byCategory = groupCompliance(live, (r) => r.category).sort(
      (a, b) => CATEGORIES.indexOf(a.key as never) - CATEGORIES.indexOf(b.key as never),
    );
    const byTrade = groupCompliance(live, (r) => r.trade).sort((a, b) => b.total - a.total);
    const byMonth = groupCompliance(live, (r) => (r.reportedAt ? monthKey(r.reportedAt) : undefined), formatMonthKey).sort((a, b) =>
      a.key.localeCompare(b.key),
    );
    const byLocation = groupCompliance(live, (r) => r.normalisedLocation, displayLocation)
      .sort((a, b) => b.total - a.total)
      .slice(0, 15);

    const worst = live
      .map((r) => ({ r, h: breachHours(r) }))
      .filter((x): x is { r: EnrichedRecord; h: number } => x.h !== undefined)
      .sort((a, b) => b.h - a.h)
      .slice(0, 20);

    return { timed, resp, tat, respMet, tatMet, openBreached, openKnown, dq, byCategory, byTrade, byMonth, byLocation, worst };
  }, [live]);

  if (!live.length) return <EmptyState title="No records match the current filters" />;
  if (!stats.timed.length) {
    return <NotAvailable reason="No reported date/time is mapped, so SLA performance cannot be measured." />;
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">SLA performance</h2>
        <p className="text-sm text-muted-foreground">
          Response ≤ {SLA_CONFIG.responseHours} h and turnaround ≤ {SLA_CONFIG.turnaroundHours} h, measured from the reported time in calendar
          hours (24/7). Percentages use only records where the outcome is known.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiTile
          label="Response SLA met"
          value={stats.resp.length ? `${Math.round((stats.respMet / stats.resp.length) * 100)}%` : "n/a"}
          sub={`${stats.respMet.toLocaleString()} of ${stats.resp.length.toLocaleString()} with response time`}
        />
        <KpiTile
          label="TAT SLA met"
          value={stats.tat.length ? `${Math.round((stats.tatMet / stats.tat.length) * 100)}%` : "n/a"}
          sub={`${stats.tatMet.toLocaleString()} of ${stats.tat.length.toLocaleString()} completed`}
        />
        <KpiTile label="Median response" value={fmtHours(median(stats.resp))} sub={`Target ${SLA_CONFIG.responseHours} h`} />
        <KpiTile label="Median turnaround" value={fmtHours(median(stats.tat))} sub={`Target ${SLA_CONFIG.turnaroundHours} h`} />
        <KpiTile
          label="Open past 4 h"
          value={stats.openKnown ? stats.openBreached.toLocaleString() : "n/a"}
          sub={`of ${stats.openKnown.toLocaleString()} open records`}
        />
      </div>

      {stats.dq > 0 && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <AlertTriangle className="size-3.5" aria-hidden />
          {stats.dq} record{stats.dq === 1 ? "" : "s"} excluded from SLA statistics for negative or implausible (&gt; 365 day) durations.
        </p>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard title="Compliance by category" description="Click a category to filter.">
          <ComplianceChart rows={stats.byCategory} filterKey="categories" />
        </ChartCard>
        <ChartCard title="Compliance by trade" description="Click a trade to filter.">
          <ComplianceChart rows={stats.byTrade} filterKey="trades" />
        </ChartCard>
        <ChartCard title="Compliance by month">
          <ComplianceChart rows={stats.byMonth} />
        </ChartCard>
        <ChartCard title="Compliance by location" description="Top 15 locations by volume. Click to filter.">
          <ComplianceChart rows={stats.byLocation} horizontal filterKey="locations" height={Math.max(220, stats.byLocation.length * 28)} />
        </ChartCard>
        <ChartCard title="Response time distribution" description={`Hours from report to response. Dashed line = ${SLA_CONFIG.responseHours} h target.`}>
          <Histogram values={stats.resp} target={SLA_CONFIG.responseHours} label="Response" />
        </ChartCard>
        <ChartCard title="Turnaround time distribution" description={`Hours from report to completion. Dashed line = ${SLA_CONFIG.turnaroundHours} h target.`}>
          <Histogram values={stats.tat} target={SLA_CONFIG.turnaroundHours} label="Completion" />
        </ChartCard>
      </div>

      <ChartCard title="Worst 20 breaches" description="Largest turnaround (completed) or age (still open) beyond the 4 h target.">
        {stats.worst.length ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Priority</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Reported</TableHead>
                  <TableHead className="text-right">Response</TableHead>
                  <TableHead className="text-right">TAT / age</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.worst.map(({ r, h }) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <ScoreWithBreakdown b={r.score} />
                    </TableCell>
                    <TableCell>
                      <button type="button" className="hover:underline" onClick={() => toggle("categories", r.category)}>
                        <CategoryLabel category={r.category} />
                      </button>
                    </TableCell>
                    <TableCell className="max-w-sm truncate" title={r.description}>
                      {r.description}
                    </TableCell>
                    <TableCell className="max-w-48 truncate" title={r.location}>
                      {r.location ?? "—"}
                    </TableCell>
                    <TableCell className="tabular-nums">{formatDateTime(r.reportedAt)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtHours(r.sla.responseHours)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtHours(h)}
                      {r.sla.isOpen && <span className="ml-1 text-xs text-muted-foreground">(open)</span>}
                    </TableCell>
                    <TableCell>{r.statusNormalised}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <EmptyState title="No turnaround breaches in the current selection" />
        )}
      </ChartCard>
    </div>
  );
}
