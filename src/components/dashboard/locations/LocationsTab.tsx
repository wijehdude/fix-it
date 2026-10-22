"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CategoryLabel, ChartCard, EmptyState } from "@/components/common/bits";
import { AXIS_PROPS, GRID_STROKE, HBAR_RADIUS, TooltipBox, seqColor, seqTextClass } from "@/components/common/chart";
import { CriticalityLabel, LocationCriticalityTable } from "@/components/locations/LocationCriticalityTable";
import { CATEGORIES, type Category } from "@/config/categories";
import { useFiltered } from "@/hooks/useAnalysis";
import { displayLocation } from "@/lib/analysis/locations";
import { formatDate } from "@/lib/parse/dates";
import type { Criticality } from "@/lib/types";
import { useAnalysisStore } from "@/store/useAnalysisStore";

type LocRow = { loc: string; label: string; count: number; byCat: Record<string, number> };
type Hotspot = { loc: string; repeats: number; categories: Category[]; lastSeen?: Date; criticality: Criticality | "Unknown" };

export function LocationsTab() {
  const { live } = useFiltered();
  const toggle = useAnalysisStore((s) => s.toggleFilter);
  const selectedLocations = useAnalysisStore((s) => s.filters.locations);

  const { top15, top20, maxCell, hotspots, unspecified } = useMemo(() => {
    const map = new Map<string, LocRow>();
    let unspecified = 0;
    for (const r of live) {
      if (!r.normalisedLocation) {
        unspecified++;
        continue;
      }
      const row = map.get(r.normalisedLocation) ?? { loc: r.normalisedLocation, label: displayLocation(r.normalisedLocation), count: 0, byCat: {} };
      row.count++;
      row.byCat[r.category] = (row.byCat[r.category] ?? 0) + 1;
      map.set(r.normalisedLocation, row);
    }
    const sorted = [...map.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    const top20 = sorted.slice(0, 20);
    const maxCell = Math.max(0, ...top20.flatMap((r) => Object.values(r.byCat)));

    const hs = new Map<string, Hotspot>();
    for (const r of live) {
      if (!r.isLocationRepeat || !r.normalisedLocation) continue;
      const h = hs.get(r.normalisedLocation) ?? { loc: r.normalisedLocation, repeats: 0, categories: [], criticality: r.criticality };
      h.repeats++;
      if (!h.categories.includes(r.category)) h.categories.push(r.category);
      if (r.reportedAt && (!h.lastSeen || r.reportedAt > h.lastSeen)) h.lastSeen = r.reportedAt;
      hs.set(r.normalisedLocation, h);
    }
    const hotspots = [...hs.values()].sort((a, b) => b.repeats - a.repeats).slice(0, 25);
    return { top15: sorted.slice(0, 15), top20, maxCell, hotspots, unspecified };
  }, [live]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Locations</h2>
        <p className="text-sm text-muted-foreground">
          Where defects occur, how critical each location is, and where the same problem keeps coming back.
          {unspecified > 0 && ` ${unspecified} record${unspecified === 1 ? "" : "s"} without a location are not shown.`}
        </p>
      </div>

      <ChartCard title="Location criticality" description="AI rating with your overrides. Changes recompute every priority score immediately.">
        <LocationCriticalityTable maxHeight={400} />
      </ChartCard>

      {!live.length ? (
        <EmptyState title="No records match the current filters" />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          <ChartCard title="Defects by location" description="Top 15 by record count. Click a bar to filter.">
            {top15.length ? (
              <ResponsiveContainer width="100%" height={Math.max(200, top15.length * 26)}>
                <BarChart data={top15} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
                  <CartesianGrid stroke={GRID_STROKE} horizontal={false} />
                  <XAxis type="number" allowDecimals={false} {...AXIS_PROPS} />
                  <YAxis type="category" dataKey="label" width={170} interval={0} {...AXIS_PROPS} />
                  <Tooltip
                    cursor={{ fill: "var(--muted)", opacity: 0.5 }}
                    content={({ active, payload }) => {
                      const p = payload?.[0]?.payload as LocRow | undefined;
                      if (!active || !p) return null;
                      return (
                        <TooltipBox
                          title={p.label}
                          rows={[
                            { label: "Records", value: p.count },
                            ...Object.entries(p.byCat)
                              .sort((a, b) => b[1] - a[1])
                              .map(([c, n]) => ({ label: c, value: n })),
                          ]}
                        />
                      );
                    }}
                  />
                  <Bar
                    dataKey="count"
                    name="Records"
                    fill="var(--seq-4)"
                    radius={HBAR_RADIUS}
                    maxBarSize={16}
                    cursor="pointer"
                    onClick={(d) => {
                      const p = d.payload as LocRow | undefined;
                      if (p) toggle("locations", p.loc);
                    }}
                    label={{ position: "right", fill: "var(--viz-ink)", fontSize: 11 }}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState title="No locations in the data" />
            )}
          </ChartCard>

          <ChartCard title="Location × category" description="Top 20 locations. Click a row to filter by location.">
            {top20.length ? (
              <div className="overflow-x-auto">
                <table className="w-full border-separate text-xs tabular-nums" style={{ borderSpacing: 2 }}>
                  <caption className="sr-only">Record counts by location and category</caption>
                  <thead>
                    <tr>
                      <th scope="col" className="text-left font-normal text-muted-foreground">
                        Location
                      </th>
                      {CATEGORIES.map((c) => (
                        <th key={c} scope="col" className="px-1 text-center font-normal text-muted-foreground">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {top20.map((row) => (
                      <tr key={row.loc}>
                        <th scope="row" className="max-w-44 truncate pr-2 text-left font-normal">
                          <button
                            type="button"
                            className={`truncate hover:underline ${selectedLocations.includes(row.loc) ? "font-semibold" : ""}`}
                            onClick={() => toggle("locations", row.loc)}
                            title={row.label}
                          >
                            {row.label}
                          </button>
                        </th>
                        {CATEGORIES.map((c) => {
                          const v = row.byCat[c] ?? 0;
                          return (
                            <td
                              key={c}
                              title={`${row.label} · ${c}: ${v}`}
                              className={`h-7 min-w-12 rounded-[3px] text-center ${seqTextClass(v, maxCell)}`}
                              style={{ background: seqColor(v, maxCell) }}
                            >
                              {v || ""}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="No locations in the data" />
            )}
          </ChartCard>
        </div>
      )}

      <ChartCard
        title="Repeat-location hotspots"
        description="Locations where the same category of defect was reported 2+ times within 30 days — a strong sign of an unresolved root cause."
      >
        {hotspots.length ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Location</TableHead>
                  <TableHead className="text-right">Repeat records</TableHead>
                  <TableHead>Categories</TableHead>
                  <TableHead>Last seen</TableHead>
                  <TableHead>Criticality</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {hotspots.map((h) => (
                  <TableRow key={h.loc}>
                    <TableCell className="font-medium">
                      <button type="button" className="hover:underline" onClick={() => toggle("locations", h.loc)}>
                        {displayLocation(h.loc)}
                      </button>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{h.repeats}</TableCell>
                    <TableCell>
                      <span className="flex flex-wrap gap-x-3 gap-y-1">
                        {h.categories.map((c) => (
                          <CategoryLabel key={c} category={c} />
                        ))}
                      </span>
                    </TableCell>
                    <TableCell className="tabular-nums">{formatDate(h.lastSeen)}</TableCell>
                    <TableCell>
                      <CriticalityLabel level={h.criticality} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <EmptyState title="No repeat-location hotspots in the current selection" />
        )}
      </ChartCard>
    </div>
  );
}
