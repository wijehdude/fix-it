"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChartCard, EmptyState } from "@/components/common/bits";
import { AXIS_PROPS, GRID_STROKE, HBAR_RADIUS, SimpleTooltip } from "@/components/common/chart";
import { useFiltered } from "@/hooks/useAnalysis";
import { round } from "@/lib/analysis/stats";
import { useAnalysisStore } from "@/store/useAnalysisStore";

const UNCLASSIFIED = "Unclassified";

type FnRow = {
  fn: string;
  records: number;
  clusters: number;
  recurring: number;
  meanSeverity?: number;
  p1p2: number;
};

export function FunctionsTab() {
  const { live, clusters } = useFiltered();
  const toggleFilter = useAnalysisStore((s) => s.toggleFilter);

  const rows = useMemo<FnRow[]>(() => {
    const map = new Map<string, { records: number; sevSum: number; sevN: number; p1p2: number }>();
    for (const r of live) {
      const fn = r.cls?.systemFunction ?? UNCLASSIFIED;
      const e = map.get(fn) ?? { records: 0, sevSum: 0, sevN: 0, p1p2: 0 };
      e.records++;
      if (r.cls) {
        e.sevSum += r.cls.severity;
        e.sevN++;
      }
      if (r.score.band === "P1" || r.score.band === "P2") e.p1p2++;
      map.set(fn, e);
    }
    const clusterCounts = new Map<string, { all: number; recurring: number }>();
    for (const c of clusters) {
      if (c.count < 2) continue;
      const e = clusterCounts.get(c.systemFunction) ?? { all: 0, recurring: 0 };
      e.all++;
      if (c.isRecurring) e.recurring++;
      clusterCounts.set(c.systemFunction, e);
    }
    return [...map.entries()]
      .map(([fn, e]) => ({
        fn,
        records: e.records,
        clusters: clusterCounts.get(fn)?.all ?? 0,
        recurring: clusterCounts.get(fn)?.recurring ?? 0,
        meanSeverity: e.sevN ? e.sevSum / e.sevN : undefined,
        p1p2: e.p1p2,
      }))
      .sort((a, b) => b.records - a.records);
  }, [live, clusters]);

  if (!rows.length) return <EmptyState title="No records match the filters" />;

  const recurringData = rows.filter((r) => r.recurring > 0).sort((a, b) => b.recurring - a.recurring);
  const chartHeight = Math.max(200, rows.length * 26 + 30);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard title="Defects by system function" description="Non-duplicate records. Click a bar to filter.">
          <div style={{ height: chartHeight }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 8 }}>
                <CartesianGrid stroke={GRID_STROKE} horizontal={false} />
                <XAxis type="number" {...AXIS_PROPS} allowDecimals={false} />
                <YAxis type="category" dataKey="fn" {...AXIS_PROPS} width={210} interval={0} />
                <Tooltip cursor={{ fill: "var(--muted)" }} content={<SimpleTooltip />} />
                <Bar
                  dataKey="records"
                  name="Records"
                  fill="var(--seq-4)"
                  radius={HBAR_RADIUS}
                  maxBarSize={18}
                  cursor="pointer"
                  onClick={(d) => {
                    const fn = (d.payload as FnRow).fn;
                    if (fn !== UNCLASSIFIED) toggleFilter("systemFunctions", fn);
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Recurring issues by system function" description="Clusters meeting the recurring threshold.">
          {recurringData.length ? (
            <div style={{ height: Math.max(200, recurringData.length * 26 + 30) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={recurringData} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 8 }}>
                  <CartesianGrid stroke={GRID_STROKE} horizontal={false} />
                  <XAxis type="number" {...AXIS_PROPS} allowDecimals={false} />
                  <YAxis type="category" dataKey="fn" {...AXIS_PROPS} width={210} interval={0} />
                  <Tooltip cursor={{ fill: "var(--muted)" }} content={<SimpleTooltip />} />
                  <Bar
                    dataKey="recurring"
                    name="Recurring issues"
                    fill="var(--seq-6)"
                    radius={HBAR_RADIUS}
                    maxBarSize={18}
                    cursor="pointer"
                    onClick={(d) => {
                      const fn = (d.payload as FnRow).fn;
                      if (fn !== UNCLASSIFIED) toggleFilter("systemFunctions", fn);
                    }}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState title="No recurring issues in the current filter" />
          )}
        </ChartCard>
      </div>

      <ChartCard title="Severity by system function" description="Mean AI severity (1 = cosmetic, 5 = safety/security risk).">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>System function</TableHead>
                <TableHead className="text-right">Records</TableHead>
                <TableHead className="text-right">Clusters (≥ 2)</TableHead>
                <TableHead className="text-right">Recurring</TableHead>
                <TableHead className="text-right">P1/P2 records</TableHead>
                <TableHead className="w-64">Mean severity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.fn}>
                  <TableCell className="font-medium">
                    {r.fn === UNCLASSIFIED ? (
                      r.fn
                    ) : (
                      <button className="text-left hover:underline" onClick={() => toggleFilter("systemFunctions", r.fn)}>
                        {r.fn}
                      </button>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.records}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.clusters}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.recurring}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.p1p2}</TableCell>
                  <TableCell>
                    {r.meanSeverity === undefined ? (
                      <span className="text-muted-foreground">n/a</span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 rounded-full bg-muted" aria-hidden>
                          <div
                            className="h-2 rounded-full"
                            style={{ width: `${(r.meanSeverity / 5) * 100}%`, background: "var(--seq-5)" }}
                          />
                        </div>
                        <span className="w-8 text-right tabular-nums">{round(r.meanSeverity, 1)}</span>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </ChartCard>
    </div>
  );
}
