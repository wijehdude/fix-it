"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AiMarker } from "@/components/common/bits";
import { NativeSelect } from "@/components/common/NativeSelect";
import { CRITICALITY_LEVELS, type Criticality } from "@/config/locations";
import { displayLocation, effectiveCriticality } from "@/lib/analysis/locations";
import { useDerived } from "@/hooks/useAnalysis";
import { useAnalysisStore } from "@/store/useAnalysisStore";

const LEVEL_STYLE: Record<Criticality | "Unknown", string> = {
  High: "var(--status-critical)",
  Medium: "var(--status-warning)",
  Low: "var(--viz-muted)",
  Unknown: "var(--viz-axis)",
};

export function CriticalityLabel({ level }: { level: Criticality | "Unknown" }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="size-2 rounded-full" style={{ background: LEVEL_STYLE[level] }} aria-hidden />
      {level}
    </span>
  );
}

/** Editable location criticality table. Overrides recompute every score live. */
export function LocationCriticalityTable({ maxHeight = 520 }: { maxHeight?: number }) {
  const derived = useDerived();
  const ratings = useAnalysisStore((s) => s.locationRatings);
  const overrideLocation = useAnalysisStore((s) => s.overrideLocation);
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of derived.records) {
      if (r.normalisedLocation && !r.isDuplicate) counts.set(r.normalisedLocation, (counts.get(r.normalisedLocation) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([loc, count]) => ({ loc, count, rating: ratings[loc] }))
      .filter((r) => !query || r.loc.includes(query.toLowerCase()))
      .sort((a, b) => b.count - a.count || a.loc.localeCompare(b.loc));
  }, [derived.records, ratings, query]);

  const overrides = Object.values(ratings).filter((r) => r.override).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-64">
          <Search className="absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search locations"
            className="h-8 pl-8"
            aria-label="Search locations"
          />
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">
          {rows.length} locations · {overrides} overridden
        </span>
      </div>
      <div className="overflow-auto rounded-lg border" style={{ maxHeight }}>
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card">
            <TableRow>
              <TableHead>Location</TableHead>
              <TableHead className="text-right">Records</TableHead>
              <TableHead>AI rating</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead className="w-40">Override</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ loc, count, rating }) => (
              <TableRow key={loc}>
                <TableCell className="font-medium">{displayLocation(loc)}</TableCell>
                <TableCell className="text-right tabular-nums">{count}</TableCell>
                <TableCell>
                  {rating?.ai ? (
                    <span className="inline-flex items-center gap-1.5">
                      <CriticalityLabel level={rating.ai} />
                      <AiMarker text={rating.reason} />
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Unknown (0.5 used)</span>
                  )}
                </TableCell>
                <TableCell className="max-w-xs text-xs whitespace-normal text-muted-foreground">{rating?.reason ?? "—"}</TableCell>
                <TableCell>
                  <NativeSelect
                    aria-label={`Override criticality for ${displayLocation(loc)}`}
                    value={rating?.override ?? ""}
                    onChange={(e) => overrideLocation(loc, (e.target.value || null) as Criticality | null)}
                  >
                    <option value="">Use AI ({effectiveCriticality(rating ? { ...rating, override: undefined } : undefined)})</option>
                    {CRITICALITY_LEVELS.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </NativeSelect>
                </TableCell>
              </TableRow>
            ))}
            {!rows.length && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  No locations{query ? " match your search" : " in the data (location column not mapped or empty)"}.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
