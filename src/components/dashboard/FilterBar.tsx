"use client";

import { Filter, X } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { CATEGORIES } from "@/config/categories";
import { PRIORITY_BAND_LIST } from "@/config/scoring";
import { displayLocation } from "@/lib/analysis/locations";
import { filtersActive } from "@/lib/analysis/derive";
import { useDerived } from "@/hooks/useAnalysis";
import { useAnalysisStore, type Filters } from "@/store/useAnalysisStore";

type MultiKey = Exclude<keyof Filters, "dateFrom" | "dateTo">;

function MultiFilter({ label, field, options, format }: { label: string; field: MultiKey; options: string[]; format?: (v: string) => string }) {
  const selected = useAnalysisStore((s) => s.filters[field]) as string[];
  const toggle = useAnalysisStore((s) => s.toggleFilter);
  const setFilters = useAnalysisStore((s) => s.setFilters);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={selected.length ? "secondary" : "outline"} size="sm" className="h-8">
          {label}
          {selected.length > 0 && <span className="rounded bg-background px-1 text-xs tabular-nums">{selected.length}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="max-h-80 w-64 overflow-y-auto" align="start">
        <DropdownMenuLabel className="flex items-center justify-between">
          {label}
          {selected.length > 0 && (
            <button className="text-xs font-normal text-muted-foreground underline" onClick={() => setFilters({ [field]: [] })}>
              Clear
            </button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.map((o) => (
          <DropdownMenuCheckboxItem
            key={o}
            checked={selected.includes(o)}
            onCheckedChange={() => toggle(field, o as never)}
            onSelect={(e) => e.preventDefault()}
          >
            {format ? format(o) : o}
          </DropdownMenuCheckboxItem>
        ))}
        {!options.length && <p className="px-2 py-1.5 text-xs text-muted-foreground">No values</p>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Global filter bar — applies to every tab. Chart clicks add to these filters (cross-filtering). */
export function FilterBar() {
  const derived = useDerived();
  const filters = useAnalysisStore((s) => s.filters);
  const setFilters = useAnalysisStore((s) => s.setFilters);
  const clear = useAnalysisStore((s) => s.clearFilters);

  const options = useMemo(() => {
    const locs = new Map<string, number>();
    const sheets = new Set<string>();
    const fns = new Set<string>();
    const trades = new Set<string>();
    for (const r of derived.records) {
      if (r.normalisedLocation) locs.set(r.normalisedLocation, (locs.get(r.normalisedLocation) ?? 0) + 1);
      sheets.add(r.sourceSheet);
      if (r.cls) fns.add(r.cls.systemFunction);
      trades.add(r.trade);
    }
    return {
      locations: [...locs.entries()].sort((a, b) => b[1] - a[1]).map(([l]) => l),
      sheets: [...sheets],
      functions: [...fns].sort(),
      trades: [...trades].sort(),
    };
  }, [derived.records]);

  const active = filtersActive(filters);

  return (
    <div className="flex flex-wrap items-center gap-2 border-b bg-background px-4 py-2" role="search" aria-label="Global filters">
      <Filter className="size-4 text-muted-foreground" aria-hidden />
      <label className="flex items-center gap-1 text-xs text-muted-foreground">
        From
        <Input
          type="date"
          className="h-8 w-36"
          value={filters.dateFrom ?? ""}
          onChange={(e) => setFilters({ dateFrom: e.target.value || undefined })}
          aria-label="From date"
        />
      </label>
      <label className="flex items-center gap-1 text-xs text-muted-foreground">
        To
        <Input
          type="date"
          className="h-8 w-36"
          value={filters.dateTo ?? ""}
          onChange={(e) => setFilters({ dateTo: e.target.value || undefined })}
          aria-label="To date"
        />
      </label>
      <MultiFilter label="Category" field="categories" options={[...CATEGORIES]} />
      <MultiFilter label="Location" field="locations" options={options.locations} format={displayLocation} />
      <MultiFilter label="Priority" field="bands" options={PRIORITY_BAND_LIST} />
      <MultiFilter label="Status" field="statuses" options={["Open", "Closed", "Unknown"]} />
      <MultiFilter label="Sheet" field="sheets" options={options.sheets} />
      <MultiFilter label="System function" field="systemFunctions" options={options.functions} />
      <MultiFilter label="Trade" field="trades" options={options.trades} />
      {active && (
        <Button variant="ghost" size="sm" className="h-8" onClick={clear}>
          <X /> Clear filters
        </Button>
      )}
    </div>
  );
}
