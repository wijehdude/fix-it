"use client";

import type { ReactNode } from "react";
import { CATEGORIES, CATEGORY_COLOR_VAR, type Category } from "@/config/categories";

/** Shared Recharts styling: recessive axes and grid, text in ink tokens (never series colours). */
export const AXIS_PROPS = {
  tick: { fill: "var(--viz-muted)", fontSize: 11 },
  axisLine: { stroke: "var(--viz-axis)" },
  tickLine: false,
} as const;

export const GRID_STROKE = "var(--viz-grid)";
export const BAR_RADIUS: [number, number, number, number] = [4, 4, 0, 0];
export const HBAR_RADIUS: [number, number, number, number] = [0, 4, 4, 0];

export function categoryColor(c: string): string {
  return CATEGORY_COLOR_VAR[c as Category] ?? "var(--viz-muted)";
}

type TooltipRow = { label: string; value: ReactNode; color?: string };

export function TooltipBox({ title, rows }: { title?: ReactNode; rows: TooltipRow[] }) {
  return (
    <div className="min-w-36 rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      {title && <p className="mb-1 font-semibold">{title}</p>}
      <ul className="space-y-0.5">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-2">
            {r.color && <span className="size-2 shrink-0 rounded-[2px]" style={{ background: r.color }} aria-hidden />}
            <span className="text-muted-foreground">{r.label}</span>
            <span className="ml-auto pl-3 font-medium tabular-nums">{r.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Generic Recharts tooltip renderer that lists every payload entry. */
export function SimpleTooltip({
  active,
  payload,
  label,
  labelFormatter,
  valueFormatter,
}: {
  active?: boolean;
  payload?: { name?: string | number; value?: number | string; color?: string; fill?: string; dataKey?: string | number }[];
  label?: string | number;
  labelFormatter?: (l: string | number) => ReactNode;
  valueFormatter?: (v: number | string) => ReactNode;
}) {
  if (!active || !payload?.length) return null;
  const rows = payload
    .filter((p) => p.value !== undefined && p.value !== 0)
    .map((p) => ({
      label: String(p.name ?? p.dataKey ?? ""),
      value: valueFormatter ? valueFormatter(p.value!) : p.value,
      color: p.color ?? p.fill,
    }));
  return <TooltipBox title={label !== undefined ? (labelFormatter ? labelFormatter(label) : label) : undefined} rows={rows} />;
}

/** Legend for the six categories (identity never by colour alone: names are always shown). */
export function CategoryLegend({ categories = [...CATEGORIES] }: { categories?: string[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Legend">
      {categories.map((c) => (
        <li key={c} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px]" style={{ background: categoryColor(c) }} aria-hidden />
          {c}
        </li>
      ))}
    </ul>
  );
}

/** Sequential blue ramp (8 steps) for heatmaps. */
export function seqColor(value: number, max: number): string {
  if (!max || value <= 0) return "var(--seq-0)";
  const step = Math.min(7, Math.max(1, Math.ceil((value / max) * 7)));
  return `var(--seq-${step})`;
}

/** Text colour that stays readable on a sequential cell. */
export function seqTextClass(value: number, max: number): string {
  if (!max || value <= 0) return "text-muted-foreground";
  const step = Math.ceil((value / max) * 7);
  return step >= 5 ? "text-white" : "text-foreground";
}
