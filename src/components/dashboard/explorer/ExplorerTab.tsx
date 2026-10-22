"use client";

import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type FilterFn,
  type SortingState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { AiMarker, EmptyState, ScoreWithBreakdown, fmtHours } from "@/components/common/bits";
import { NativeSelect } from "@/components/common/NativeSelect";
import { CATEGORIES, type Category } from "@/config/categories";
import { useFiltered } from "@/hooks/useAnalysis";
import type { EnrichedRecord } from "@/lib/analysis/derive";
import { formatDateTime } from "@/lib/parse/dates";
import { useAnalysisStore } from "@/store/useAnalysisStore";

const ROW_HEIGHT = 40;

function slaText(r: EnrichedRecord): string {
  const s = r.sla;
  if (s.turnaroundMet === false) return "TAT breached";
  if (s.isOpen && s.openBreached) return "Open > 4 h";
  if (s.responseMet === false) return "Response breached";
  if (s.turnaroundMet === true) return "Met";
  if (s.isOpen && s.openBreached === false) return "Open, within SLA";
  return "n/a";
}

function CategoryCell({ r }: { r: EnrichedRecord }) {
  const override = useAnalysisStore((s) => s.categoryOverrides[r.id]);
  const overrideCategory = useAnalysisStore((s) => s.overrideCategory);
  const aiCategory = r.cls?.category;
  return (
    <div className="flex items-center gap-1">
      <NativeSelect
        className="w-40"
        aria-label={`Category for row ${r.sourceRow} in ${r.sourceSheet}`}
        value={override ?? ""}
        onChange={(e) => overrideCategory(r.id, (e.target.value || null) as Category | null)}
      >
        <option value="">{aiCategory ? `AI: ${aiCategory}` : `Fallback: ${r.category}`}</option>
        {CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </NativeSelect>
      {r.cls && !override && <AiMarker cls={r.cls} />}
      {override && (
        <Badge variant="outline" className="border-[var(--accent-brand)] text-[10px]">
          Overridden
        </Badge>
      )}
    </div>
  );
}

const globalFilter: FilterFn<EnrichedRecord> = (row, _columnId, value: string) => {
  const q = value.trim().toLowerCase();
  if (!q) return true;
  const r = row.original;
  const hay = [
    r.description,
    r.location,
    r.sourceSheet,
    r.legacyCategory,
    r.category,
    r.othersSubTheme,
    r.cls?.faultType,
    r.cls?.systemFunction,
    r.cls?.suspectedRootCause,
    r.actionTaken,
    r.assetOrEquipment,
    r.status,
    r.trade,
    ...Object.values(r.extra).map((v) => String(v)),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
};

export function ExplorerTab() {
  const { derived, records } = useFiltered();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [query, setQuery] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const extraKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const r of derived.records) for (const k of Object.keys(r.extra)) keys.add(k);
    return [...keys];
  }, [derived.records]);

  const columns = useMemo<ColumnDef<EnrichedRecord>[]>(() => {
    const text = (v: unknown) => (v === undefined || v === null || v === "" ? "—" : String(v));
    const base: ColumnDef<EnrichedRecord>[] = [
      { id: "sheet", header: "Sheet", accessorFn: (r) => r.sourceSheet, size: 110 },
      { id: "row", header: "Row", accessorFn: (r) => r.sourceRow, size: 60 },
      { id: "legacy", header: "Legacy category", accessorFn: (r) => r.legacyCategory, size: 130 },
      {
        id: "category",
        header: "Category",
        accessorFn: (r) => r.category,
        size: 250,
        cell: ({ row }) => <CategoryCell r={row.original} />,
      },
      { id: "sub", header: "Sub-theme", accessorFn: (r) => r.othersSubTheme ?? "", size: 120, cell: (c) => text(c.getValue()) },
      {
        id: "description",
        header: "Description",
        accessorFn: (r) => r.description,
        size: 320,
        cell: ({ row }) => (
          <span className="flex items-center gap-1.5" title={row.original.description}>
            {row.original.isDuplicate && (
              <Badge variant="outline" className="shrink-0 text-[10px]">
                Duplicate
              </Badge>
            )}
            <span className="truncate">{row.original.description}</span>
          </span>
        ),
      },
      {
        id: "location",
        header: "Location",
        accessorFn: (r) => r.location ?? "",
        size: 180,
        cell: ({ row }) => text(row.original.location),
      },
      {
        id: "reported",
        header: "Reported",
        accessorFn: (r) => r.reportedAt?.getTime() ?? -Infinity,
        size: 140,
        cell: ({ row }) => formatDateTime(row.original.reportedAt),
      },
      {
        id: "responded",
        header: "Responded",
        accessorFn: (r) => r.respondedAt?.getTime() ?? -Infinity,
        size: 140,
        cell: ({ row }) => formatDateTime(row.original.respondedAt),
      },
      {
        id: "completed",
        header: "Completed",
        accessorFn: (r) => r.completedAt?.getTime() ?? -Infinity,
        size: 140,
        cell: ({ row }) => formatDateTime(row.original.completedAt),
      },
      {
        id: "status",
        header: "Status",
        accessorFn: (r) => r.statusNormalised,
        size: 90,
      },
      {
        id: "resp",
        header: "Response",
        accessorFn: (r) => r.sla.responseHours ?? -1,
        size: 90,
        cell: ({ row }) => fmtHours(row.original.sla.responseHours),
      },
      {
        id: "tat",
        header: "TAT",
        accessorFn: (r) => r.sla.turnaroundHours ?? -1,
        size: 80,
        cell: ({ row }) => fmtHours(row.original.sla.turnaroundHours),
      },
      { id: "sla", header: "SLA", accessorFn: (r) => slaText(r), size: 130 },
      {
        id: "fn",
        header: "System function",
        accessorFn: (r) => r.cls?.systemFunction ?? "",
        size: 210,
        cell: ({ row }) => text(row.original.cls?.systemFunction),
      },
      {
        id: "fault",
        header: "Fault type",
        accessorFn: (r) => r.cls?.faultType ?? "",
        size: 180,
        cell: ({ row }) => text(row.original.cls?.faultType),
      },
      {
        id: "severity",
        header: "Severity",
        accessorFn: (r) => r.cls?.severity ?? 0,
        size: 80,
        cell: ({ row }) => text(row.original.cls?.severity),
      },
      {
        id: "impact",
        header: "Impact",
        accessorFn: (r) => r.cls?.operationalImpact ?? "",
        size: 130,
        cell: ({ row }) => text(row.original.cls?.operationalImpact),
      },
      {
        id: "rootcause",
        header: "Suspected root cause",
        accessorFn: (r) => r.cls?.suspectedRootCause ?? "",
        size: 220,
        cell: ({ row }) => <span title={row.original.cls?.suspectedRootCause}>{text(row.original.cls?.suspectedRootCause)}</span>,
      },
      {
        id: "confidence",
        header: "Confidence",
        accessorFn: (r) => r.cls?.confidence ?? -1,
        size: 90,
        cell: ({ row }) => (row.original.cls ? `${Math.round(row.original.cls.confidence * 100)}%` : "n/a"),
      },
      { id: "trade", header: "Trade", accessorFn: (r) => r.trade, size: 170 },
      {
        id: "criticality",
        header: "Location criticality",
        accessorFn: (r) => r.criticality,
        size: 120,
      },
      {
        id: "cluster",
        header: "Cluster",
        accessorFn: (r) => (r.clusterId ? (derived.clusterById.get(r.clusterId)?.title ?? "") : ""),
        size: 220,
        cell: ({ row }) => {
          const c = row.original.clusterId ? derived.clusterById.get(row.original.clusterId) : undefined;
          return c ? (
            <span title={c.title}>
              {c.title} <span className="text-muted-foreground">({c.count})</span>
            </span>
          ) : (
            "—"
          );
        },
      },
      {
        id: "score",
        header: "Score",
        accessorFn: (r) => r.score.score,
        size: 100,
        cell: ({ row }) => <ScoreWithBreakdown b={row.original.score} />,
      },
    ];
    const extra: ColumnDef<EnrichedRecord>[] = extraKeys.map((k) => ({
      id: `extra:${k}`,
      header: k,
      accessorFn: (r) => {
        const v = r.extra[k];
        return v === undefined || v === null ? "" : typeof v === "number" ? v : String(v);
      },
      size: 140,
      cell: (c) => text(c.getValue()),
    }));
    return [...base, ...extra];
  }, [extraKeys, derived.clusterById]);

  // TanStack Table returns non-memoisable functions; it is the documented usage.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: records,
    columns,
    state: { sorting, globalFilter: query },
    onSortingChange: setSorting,
    onGlobalFilterChange: setQuery,
    globalFilterFn: globalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const rows = table.getRowModel().rows;
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });
  const items = virtualizer.getVirtualItems();
  const padTop = items.length ? items[0].start : 0;
  const padBottom = items.length ? virtualizer.getTotalSize() - items[items.length - 1].end : 0;
  const totalWidth = table.getTotalSize();

  if (!derived.records.length) return <EmptyState title="No records loaded" />;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-72">
          <Search className="absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search all columns"
            className="h-8 pl-8"
            aria-label="Search records"
          />
        </div>
        <span className="text-sm text-muted-foreground tabular-nums" aria-live="polite">
          {rows.length.toLocaleString()} of {derived.records.length.toLocaleString()} records
          {records.length !== derived.records.length && " (global filters applied)"}
        </span>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No records match" />
      ) : (
        <div ref={scrollRef} className="overflow-auto rounded-lg border" style={{ height: "calc(100vh - 260px)", minHeight: 320 }}>
          <table className="border-collapse text-sm" style={{ width: totalWidth, tableLayout: "fixed" }}>
            <colgroup>
              {table.getVisibleLeafColumns().map((c) => (
                <col key={c.id} style={{ width: c.getSize() }} />
              ))}
            </colgroup>
            <thead className="sticky top-0 z-10 bg-card shadow-[0_1px_0_var(--border)]">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((h) => {
                    const sorted = h.column.getIsSorted();
                    return (
                      <th
                        key={h.id}
                        scope="col"
                        aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none"}
                        className="h-9 px-2 text-left text-xs font-medium whitespace-nowrap text-muted-foreground"
                      >
                        <button
                          type="button"
                          className="inline-flex max-w-full items-center gap-1 truncate rounded hover:text-foreground"
                          onClick={h.column.getToggleSortingHandler()}
                        >
                          <span className="truncate">{flexRender(h.column.columnDef.header, h.getContext())}</span>
                          {sorted === "asc" ? (
                            <ArrowUp className="size-3 shrink-0" aria-hidden />
                          ) : sorted === "desc" ? (
                            <ArrowDown className="size-3 shrink-0" aria-hidden />
                          ) : (
                            <ArrowUpDown className="size-3 shrink-0 opacity-40" aria-hidden />
                          )}
                        </button>
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {padTop > 0 && (
                <tr aria-hidden>
                  <td style={{ height: padTop }} colSpan={columns.length} />
                </tr>
              )}
              {items.map((vi) => {
                const row = rows[vi.index];
                const overridden = row.original.categorySource === "override";
                return (
                  <tr
                    key={row.id}
                    style={{ height: ROW_HEIGHT }}
                    className={`border-b hover:bg-accent/40 ${overridden ? "bg-[color-mix(in_oklab,var(--accent-brand)_7%,transparent)]" : ""} ${row.original.isDuplicate ? "text-muted-foreground" : ""}`}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="truncate px-2 whitespace-nowrap">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                );
              })}
              {padBottom > 0 && (
                <tr aria-hidden>
                  <td style={{ height: padBottom }} colSpan={columns.length} />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
