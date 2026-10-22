"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Layer, Rectangle, ResponsiveContainer, Sankey, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AiMarker, CategoryLabel, ChartCard, EmptyState, KpiTile } from "@/components/common/bits";
import { AXIS_PROPS, GRID_STROKE, HBAR_RADIUS, TooltipBox, categoryColor } from "@/components/common/chart";
import { CategoryOverrideSelect } from "./CategoryOverrideSelect";
import { CATEGORIES, LOW_CONFIDENCE_THRESHOLD } from "@/config/categories";
import { useFiltered } from "@/hooks/useAnalysis";
import type { EnrichedRecord } from "@/lib/analysis/derive";
import { legacyToCategory } from "@/lib/analysis/preclassify";
import { useAnalysisStore } from "@/store/useAnalysisStore";

const isLegacyOthers = (r: Pick<EnrichedRecord, "legacyCategory">) => legacyToCategory(r.legacyCategory) === null;
const isChanged = (r: EnrichedRecord) => (legacyToCategory(r.legacyCategory) ?? "Others") !== r.category;
const PAGE = 50;

type FlowNode = { name: string; side: "legacy" | "new"; category?: string };

function FlowNodeShape(props: { x: number; y: number; width: number; height: number; payload: FlowNode & { value: number } }) {
  const { x, y, width, height, payload } = props;
  const isNew = payload.side === "new";
  return (
    <Layer>
      <Rectangle
        x={x}
        y={y}
        width={width}
        height={Math.max(2, height)}
        radius={2}
        fill={isNew ? categoryColor(payload.category ?? "") : "var(--viz-ink)"}
        fillOpacity={isNew ? 1 : 0.55}
      />
      <text
        x={isNew ? x + width + 6 : x - 6}
        y={y + height / 2}
        textAnchor={isNew ? "start" : "end"}
        dominantBaseline="middle"
        fontSize={11}
        fill="var(--foreground)"
      >
        {payload.name.replace(/^Legacy: /, "")} <tspan fill="var(--viz-muted)">{payload.value}</tspan>
      </text>
    </Layer>
  );
}

function FlowLink(props: {
  sourceX: number;
  targetX: number;
  sourceY: number;
  targetY: number;
  sourceControlX: number;
  targetControlX: number;
  linkWidth: number;
  payload: { source: FlowNode; target: FlowNode };
}) {
  const { sourceX, targetX, sourceY, targetY, sourceControlX, targetControlX, linkWidth, payload } = props;
  const legacy = legacyToCategory(payload.source.name.replace(/^Legacy: /, ""));
  const fromOthers = legacy === null;
  const changed = (legacy ?? "Others") !== payload.target.category;
  return (
    <path
      d={`M${sourceX},${sourceY} C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`}
      fill="none"
      stroke={categoryColor(payload.target.category ?? "")}
      strokeOpacity={fromOthers ? 0.55 : changed ? 0.35 : 0.18}
      strokeWidth={Math.max(1, linkWidth)}
    />
  );
}

export function ReclassTab() {
  const { live, derived } = useFiltered();
  const toggleFilter = useAnalysisStore((s) => s.toggleFilter);
  const [onlyOthers, setOnlyOthers] = useState(true);
  const [onlyLowConf, setOnlyLowConf] = useState(false);
  const [onlyChanged, setOnlyChanged] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);

  const flows = useMemo(() => {
    const legacy = [...new Set(live.map((r) => r.legacyCategory))].sort((a, b) => Number(isLegacyOthers({ legacyCategory: a })) - Number(isLegacyOthers({ legacyCategory: b })) || a.localeCompare(b));
    const cats = CATEGORIES.filter((c) => live.some((r) => r.category === c));
    const nodes: FlowNode[] = [
      ...legacy.map((l) => ({ name: `Legacy: ${l}`, side: "legacy" as const })),
      ...cats.map((c) => ({ name: c, side: "new" as const, category: c })),
    ];
    const counts = new Map<string, number>();
    for (const r of live) counts.set(`${r.legacyCategory}|${r.category}`, (counts.get(`${r.legacyCategory}|${r.category}`) ?? 0) + 1);
    const links = [...counts.entries()].map(([k, value]) => {
      const [l, c] = k.split("|");
      return { source: legacy.indexOf(l), target: legacy.length + cats.indexOf(c as (typeof cats)[number]), value };
    });
    return { nodes, links, legacyCount: legacy.length };
  }, [live]);

  const others = useMemo(() => live.filter(isLegacyOthers), [live]);
  const othersBreakdown = useMemo(
    () =>
      CATEGORIES.map((c) => ({ category: c, count: others.filter((r) => r.category === c).length })).filter((x) => x.count > 0),
    [others],
  );
  const subThemes = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of live) if (r.category === "Others") m.set(r.othersSubTheme ?? "Unspecified", (m.get(r.othersSubTheme ?? "Unspecified") ?? 0) + 1);
    return [...m.entries()].map(([theme, count]) => ({ theme, count })).sort((a, b) => b.count - a.count);
  }, [live]);

  const reclassified = others.filter((r) => r.category !== "Others").length;
  const changedOverall = live.filter(isChanged).length;
  const lowConf = live.filter((r) => r.cls && r.cls.confidence < LOW_CONFIDENCE_THRESHOLD).length;
  const overrides = live.filter((r) => r.categorySource === "override").length;

  const tableRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return live
      .filter((r) => !onlyOthers || isLegacyOthers(r))
      .filter((r) => !onlyLowConf || (r.cls !== undefined && r.cls.confidence < LOW_CONFIDENCE_THRESHOLD))
      .filter((r) => !onlyChanged || isChanged(r))
      .filter((r) => !q || `${r.description} ${r.location ?? ""} ${r.othersSubTheme ?? ""}`.toLowerCase().includes(q))
      .sort((a, b) => (a.cls?.confidence ?? 0) - (b.cls?.confidence ?? 0));
  }, [live, onlyOthers, onlyLowConf, onlyChanged, query]);
  const pages = Math.max(1, Math.ceil(tableRows.length / PAGE));
  const current = Math.min(page, pages - 1);

  if (!live.length) return <EmptyState title="No records match the current filters" />;

  const flowTotal = flows.links.reduce((a, l) => a + l.value, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label="Legacy “Others” records" value={others.length.toLocaleString()} sub={`${Math.round((others.length / live.length) * 100)}% of records`} />
        <KpiTile
          label="Others reclassified"
          value={others.length ? `${Math.round((reclassified / others.length) * 100)}%` : "n/a"}
          sub={`${reclassified} moved · ${others.length - reclassified} remain in Others`}
        />
        <KpiTile label="Low-confidence records" value={lowConf} sub={`confidence < ${LOW_CONFIDENCE_THRESHOLD} — review below`} onClick={() => { setOnlyOthers(false); setOnlyLowConf(true); }} />
        <KpiTile label="Category changes" value={changedOverall} sub={`${overrides} manual override${overrides === 1 ? "" : "s"} this session`} />
      </div>

      <ChartCard
        title="Legacy category → new category"
        description={`Every record flows from its source sheet (left) to its new category (right). Total ${flowTotal.toLocaleString()} = ${live.length.toLocaleString()} records (duplicates excluded). Strongest links highlight records leaving “Others”.`}
      >
        <div style={{ height: Math.max(320, flows.nodes.length * 34) }}>
          <ResponsiveContainer width="100%" height="100%">
            <Sankey
              data={{ nodes: flows.nodes, links: flows.links }}
              node={FlowNodeShape as never}
              link={FlowLink as never}
              nodePadding={18}
              nodeWidth={10}
              margin={{ left: 150, right: 170, top: 8, bottom: 8 }}
              sort={false}
              onClick={(item) => {
                const p = (item as unknown as { payload?: FlowNode }).payload;
                if (p?.side === "new" && p.category) toggleFilter("categories", p.category as never);
              }}
            >
              <Tooltip
                content={({ active, payload }) => {
                  const entry = payload?.[0]?.payload as { payload?: { source?: FlowNode; target?: FlowNode; value?: number; name?: string } } | undefined;
                  const p = entry?.payload;
                  if (!active || !p) return null;
                  if (p.source && p.target) {
                    return <TooltipBox title={`${p.source.name.replace(/^Legacy: /, "")} → ${p.target.name}`} rows={[{ label: "Records", value: p.value ?? 0, color: categoryColor(p.target.category ?? "") }]} />;
                  }
                  return <TooltipBox title={p.name?.replace(/^Legacy: /, "")} rows={[{ label: "Records", value: p.value ?? 0 }]} />;
                }}
              />
            </Sankey>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Where legacy “Others” went" description="Count and share of legacy Others records by new category">
          {others.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>New category</TableHead>
                  <TableHead className="text-right">Records</TableHead>
                  <TableHead className="w-1/2">Share</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {othersBreakdown.map((x) => (
                  <TableRow key={x.category} className="cursor-pointer" onClick={() => toggleFilter("categories", x.category)}>
                    <TableCell>
                      <CategoryLabel category={x.category} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{x.count}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 rounded-full bg-muted">
                          <div className="h-2 rounded-full" style={{ width: `${(x.count / others.length) * 100}%`, background: categoryColor(x.category) }} />
                        </div>
                        <span className="w-10 text-right text-xs tabular-nums">{Math.round((x.count / others.length) * 100)}%</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-medium">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right tabular-nums">{others.length}</TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          ) : (
            <EmptyState title="No legacy “Others” records in the current selection" />
          )}
        </ChartCard>

        <ChartCard title="Remaining in Others, by AI sub-theme" description="Candidates for new categories">
          {subThemes.length ? (
            <div style={{ height: Math.max(160, subThemes.length * 28 + 30) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={subThemes} layout="vertical" margin={{ left: 8, right: 24 }}>
                  <CartesianGrid stroke={GRID_STROKE} horizontal={false} />
                  <XAxis type="number" allowDecimals={false} {...AXIS_PROPS} />
                  <YAxis type="category" dataKey="theme" width={120} {...AXIS_PROPS} />
                  <Tooltip cursor={{ fill: "var(--muted)" }} content={({ active, payload }) => (active && payload?.[0] ? <TooltipBox title={String(payload[0].payload.theme)} rows={[{ label: "Records", value: payload[0].value as number }]} /> : null)} />
                  <Bar dataKey="count" name="Records" fill={categoryColor("Others")} radius={HBAR_RADIUS} barSize={14} label={{ position: "right", fontSize: 11, fill: "var(--viz-ink)" }} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState title="No records remain in Others" />
          )}
        </ChartCard>
      </div>

      <ChartCard
        title="Record review"
        description="Change any category with the dropdown — every metric updates immediately (session only). Sorted by lowest confidence first."
        action={
          <div className="relative w-56">
            <Search className="absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input className="h-8 pl-8" placeholder="Search text" value={query} onChange={(e) => (setQuery(e.target.value), setPage(0))} aria-label="Search records" />
          </div>
        }
      >
        <div className="mb-3 flex flex-wrap gap-4 text-sm">
          <div className="flex items-center gap-2">
            <Switch id="only-others" checked={onlyOthers} onCheckedChange={(v) => (setOnlyOthers(v), setPage(0))} />
            <Label htmlFor="only-others">Legacy Others only</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="only-low" checked={onlyLowConf} onCheckedChange={(v) => (setOnlyLowConf(v), setPage(0))} />
            <Label htmlFor="only-low">Low confidence (&lt; {LOW_CONFIDENCE_THRESHOLD})</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="only-changed" checked={onlyChanged} onCheckedChange={(v) => (setOnlyChanged(v), setPage(0))} />
            <Label htmlFor="only-changed">Category changed</Label>
          </div>
          <span className="ml-auto text-muted-foreground tabular-nums">{tableRows.length.toLocaleString()} records</span>
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-72">Original text</TableHead>
                <TableHead>Legacy</TableHead>
                <TableHead className="w-52">New category</TableHead>
                <TableHead>Sub-theme</TableHead>
                <TableHead className="text-right">Confidence</TableHead>
                <TableHead className="min-w-64">Rationale</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tableRows.slice(current * PAGE, current * PAGE + PAGE).map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-normal">
                    <p>{r.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.location ?? "No location"} · {r.sourceSheet} row {r.sourceRow}
                    </p>
                  </TableCell>
                  <TableCell>{r.legacyCategory}</TableCell>
                  <TableCell>
                    <CategoryOverrideSelect record={r} />
                  </TableCell>
                  <TableCell className="text-xs">{r.othersSubTheme ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.cls ? (
                      <span className={r.cls.confidence < LOW_CONFIDENCE_THRESHOLD ? "font-semibold text-[var(--status-critical)]" : ""}>
                        {Math.round(r.cls.confidence * 100)}%{r.cls.confidence < LOW_CONFIDENCE_THRESHOLD && " ⚠"}
                      </span>
                    ) : (
                      "n/a"
                    )}
                  </TableCell>
                  <TableCell className="text-xs whitespace-normal text-muted-foreground">
                    {r.cls ? (
                      <span className="inline-flex items-start gap-1">
                        <AiMarker cls={r.cls} />
                        {r.cls.rationale}
                      </span>
                    ) : (
                      "Not classified by AI — keyword/legacy fallback"
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {!tableRows.length && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    No records match.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        {pages > 1 && (
          <div className="mt-3 flex items-center justify-end gap-2 text-sm">
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
        <p className="mt-2 text-xs text-muted-foreground">Total records in analysis: {derived.records.length.toLocaleString()} (including duplicates).</p>
      </ChartCard>
    </div>
  );
}
