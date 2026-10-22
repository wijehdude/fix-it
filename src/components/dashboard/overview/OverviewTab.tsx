"use client";

import { RefreshCw } from "lucide-react";
import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import {
  AiMarker,
  CategoryLabel,
  ChartCard,
  EmptyState,
  KpiTile,
  NotAvailable,
  PriorityBadge,
  Spinner,
} from "@/components/common/bits";
import { AXIS_PROPS, BAR_RADIUS, CategoryLegend, GRID_STROKE, SimpleTooltip, categoryColor } from "@/components/common/chart";
import { CATEGORIES, OPERATIONAL_IMPACTS, type OperationalImpact } from "@/config/categories";
import { useFiltered } from "@/hooks/useAnalysis";
import { formatMonthKey, monthKey } from "@/lib/parse/dates";
import { fetchInsights } from "@/lib/pipeline/orchestrator";
import { useAnalysisStore } from "@/store/useAnalysisStore";
import type { Category } from "@/lib/types";

function pctLabel(num: number, den: number): string {
  return den ? `${Math.round((num / den) * 100)}%` : "n/a";
}

export function OverviewTab() {
  const { derived, live, clusters } = useFiltered();
  const toggleFilter = useAnalysisStore((s) => s.toggleFilter);
  const set = useAnalysisStore((s) => s.set);
  const insights = useAnalysisStore((s) => s.insights);
  const insightsStatus = useAnalysisStore((s) => s.insightsStatus);

  const kpis = useMemo(() => {
    const open = live.filter((r) => r.sla.isOpen).length;
    const respKnown = live.filter((r) => r.sla.responseMet !== undefined);
    const tatKnown = live.filter((r) => r.sla.turnaroundMet !== undefined);
    const recurring = clusters.filter((c) => c.isRecurring);
    const legacyOthers = live.filter((r) => /other/i.test(r.legacyCategory));
    const reclassified = legacyOthers.filter((r) => r.category !== "Others").length;
    return {
      total: live.length,
      open,
      resp: { met: respKnown.filter((r) => r.sla.responseMet).length, known: respKnown.length },
      tat: { met: tatKnown.filter((r) => r.sla.turnaroundMet).length, known: tatKnown.length },
      recurring: recurring.length,
      p1: recurring.filter((c) => c.band === "P1").length,
      others: { reclassified, total: legacyOthers.length },
    };
  }, [live, clusters]);

  const byCategory = useMemo(
    () => CATEGORIES.map((c) => ({ category: c, count: live.filter((r) => r.category === c).length })),
    [live],
  );

  const trend = useMemo(() => {
    const rows = derived.months.map((m) => ({ month: m, ...Object.fromEntries(CATEGORIES.map((c) => [c, 0])) }) as Record<string, number | string>);
    const idx = new Map(derived.months.map((m, i) => [m, i]));
    let dated = 0;
    for (const r of live) {
      if (!r.reportedAt) continue;
      const i = idx.get(monthKey(r.reportedAt));
      if (i === undefined) continue;
      dated++;
      rows[i][r.category] = (rows[i][r.category] as number) + 1;
    }
    return { rows, dated };
  }, [derived.months, live]);

  const impacts = useMemo(() => {
    const counts = new Map<OperationalImpact, number>();
    for (const r of live) if (r.cls) counts.set(r.cls.operationalImpact, (counts.get(r.cls.operationalImpact) ?? 0) + 1);
    return OPERATIONAL_IMPACTS.map((i) => ({ impact: i, count: counts.get(i) ?? 0 }));
  }, [live]);

  const topRecurring = useMemo(() => clusters.filter((c) => c.isRecurring).slice(0, 10), [clusters]);

  if (!derived.records.length) return <EmptyState title="No records to show" />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
        <KpiTile label="Total records" value={kpis.total.toLocaleString()} sub="excl. duplicates" />
        <KpiTile
          label="Open records"
          value={kpis.open.toLocaleString()}
          onClick={() => toggleFilter("statuses", "Open")}
          sub="Click to filter"
        />
        <KpiTile label="Response SLA met (≤ 2 h)" value={pctLabel(kpis.resp.met, kpis.resp.known)} sub={`${kpis.resp.known} with data`} />
        <KpiTile label="TAT SLA met (≤ 4 h)" value={pctLabel(kpis.tat.met, kpis.tat.known)} sub={`${kpis.tat.known} with data`} />
        <KpiTile label="Recurring issues" value={kpis.recurring} onClick={() => set({ activeTab: "clusters" })} sub="View clusters" />
        <KpiTile label="P1 recurring issues" value={kpis.p1} onClick={() => set({ activeTab: "clusters" })} sub="Highest priority" />
        <KpiTile
          label="Legacy Others reclassified"
          value={pctLabel(kpis.others.reclassified, kpis.others.total)}
          sub={`${kpis.others.reclassified} of ${kpis.others.total}`}
          onClick={() => set({ activeTab: "reclass" })}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard
          className="lg:col-span-2"
          title="Key insights"
          description="Generated from aggregate statistics only — no record text is sent."
          action={
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void fetchInsights(derived)}
              disabled={insightsStatus === "loading"}
              aria-label="Refresh insights"
            >
              <RefreshCw /> Refresh
            </Button>
          }
        >
          {insightsStatus === "loading" ? (
            <Spinner label="Generating insights…" />
          ) : insightsStatus === "error" ? (
            <p className="text-sm text-destructive" role="alert">
              Could not generate insights. Try Refresh.
            </p>
          ) : insights?.length ? (
            <ul className="space-y-2 text-sm">
              {insights.map((i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-0.5 shrink-0">
                    <AiMarker text="AI-written summary of the aggregate statistics" />
                  </span>
                  <span>{i}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No insights yet.</p>
          )}
        </ChartCard>

        <ChartCard title="Records by category" description="Click a bar to filter.">
          {kpis.total ? (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byCategory} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
                  <CartesianGrid stroke={GRID_STROKE} vertical={false} />
                  <XAxis dataKey="category" {...AXIS_PROPS} interval={0} angle={-30} textAnchor="end" height={64} tick={{ ...AXIS_PROPS.tick, fontSize: 10 }} />
                  <YAxis {...AXIS_PROPS} allowDecimals={false} />
                  <Tooltip cursor={{ fill: "var(--muted)" }} content={<SimpleTooltip />} />
                  <Bar
                    dataKey="count"
                    name="Records"
                    radius={BAR_RADIUS}
                    maxBarSize={36}
                    cursor="pointer"
                    onClick={(d) => toggleFilter("categories", (d.payload as { category: Category }).category)}
                  >
                    {byCategory.map((d) => (
                      <Cell key={d.category} fill={categoryColor(d.category)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState title="No records match the filters" />
          )}
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard className="lg:col-span-2" title="Monthly trend by category" description="Records reported per month (stacked).">
          {trend.dated ? (
            <div className="space-y-2">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trend.rows} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                    <CartesianGrid stroke={GRID_STROKE} vertical={false} />
                    <XAxis dataKey="month" {...AXIS_PROPS} tickFormatter={(m: string) => formatMonthKey(m)} />
                    <YAxis {...AXIS_PROPS} allowDecimals={false} />
                    <Tooltip content={<SimpleTooltip labelFormatter={(l) => formatMonthKey(String(l))} />} />
                    {CATEGORIES.map((c) => (
                      <Area
                        key={c}
                        type="monotone"
                        dataKey={c}
                        stackId="1"
                        stroke={categoryColor(c)}
                        strokeWidth={2}
                        fill={categoryColor(c)}
                        fillOpacity={0.55}
                      />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <CategoryLegend />
            </div>
          ) : (
            <NotAvailable reason="No reported dates are mapped, so the trend cannot be shown." />
          )}
        </ChartCard>

        <ChartCard title="Impact type mix" description="Click a bar to filter.">
          {impacts.some((i) => i.count) ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={impacts} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 8 }}>
                  <CartesianGrid stroke={GRID_STROKE} horizontal={false} />
                  <XAxis type="number" {...AXIS_PROPS} allowDecimals={false} />
                  <YAxis type="category" dataKey="impact" {...AXIS_PROPS} width={110} />
                  <Tooltip cursor={{ fill: "var(--muted)" }} content={<SimpleTooltip />} />
                  <Bar
                    dataKey="count"
                    name="Records"
                    fill="var(--seq-4)"
                    radius={[0, 4, 4, 0]}
                    maxBarSize={22}
                    cursor="pointer"
                    onClick={(d) => toggleFilter("impacts", (d.payload as { impact: string }).impact)}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState title="No AI impact assessments yet" />
          )}
        </ChartCard>
      </div>

      <ChartCard title="Top 10 recurring issues" description="Ranked by cluster priority score. Click an issue to open it.">
        {topRecurring.length ? (
          <ol className="divide-y">
            {topRecurring.map((c, i) => (
              <li key={c.id}>
                <button
                  className="flex w-full items-center gap-3 py-2 text-left text-sm hover:bg-accent/50"
                  onClick={() => set({ activeTab: "clusters", expandedClusterId: c.id })}
                >
                  <span className="w-6 text-right text-muted-foreground tabular-nums">{i + 1}</span>
                  <PriorityBadge band={c.band} score={c.score} />
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {c.title} {c.summary && <AiMarker text={c.summary.consolidatedProblemStatement} />}
                  </span>
                  <CategoryLabel category={c.category} className="hidden text-xs sm:inline-flex" />
                  <span className="w-20 text-right text-muted-foreground tabular-nums">{c.count} reports</span>
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <EmptyState title="No recurring issues">
            <p>Clusters need at least the minimum number of similar reports to count as recurring.</p>
          </EmptyState>
        )}
      </ChartCard>
    </div>
  );
}
