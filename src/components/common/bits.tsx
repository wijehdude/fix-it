"use client";

import { AlertTriangle, Inbox, Loader2, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { CATEGORY_COLOR_VAR, type Category } from "@/config/categories";
import type { PriorityBand } from "@/config/scoring";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { Classification, ScoreBreakdown } from "@/lib/types";
import { round } from "@/lib/analysis/stats";

// ---------- priority ----------
const BAND_STYLE: Record<PriorityBand, { color: string; label: string }> = {
  P1: { color: "var(--status-critical)", label: "Critical" },
  P2: { color: "var(--status-serious)", label: "High" },
  P3: { color: "var(--status-warning)", label: "Medium" },
  P4: { color: "var(--viz-muted)", label: "Low" },
};

/** Priority badge: colour + text (never colour alone). */
export function PriorityBadge({ band, score, className }: { band: PriorityBand; score?: number; className?: string }) {
  const s = BAND_STYLE[band];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-semibold whitespace-nowrap tabular-nums",
        className,
      )}
      style={{ borderColor: s.color }}
      aria-label={`Priority ${band} (${s.label})${score !== undefined ? `, score ${round(score, 0)}` : ""}`}
    >
      <span className="size-2 rounded-full" style={{ background: s.color }} aria-hidden />
      {band}
      {score !== undefined && <span className="font-normal text-muted-foreground">{round(score, 0)}</span>}
    </span>
  );
}

// ---------- category ----------
export function CategoryLabel({ category, sub, className }: { category: Category; sub?: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap", className)}>
      <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: CATEGORY_COLOR_VAR[category] }} aria-hidden />
      <span>{category}</span>
      {sub && <span className="text-muted-foreground">· {sub}</span>}
    </span>
  );
}

// ---------- AI marker ----------
/** Small "AI" marker; hover shows the rationale and confidence. */
export function AiMarker({ cls, text }: { cls?: Pick<Classification, "rationale" | "confidence">; text?: string }) {
  const body = text ?? cls?.rationale;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-0.5 rounded border border-dashed border-[var(--accent-brand)] px-1 text-[10px] leading-4 font-semibold text-[var(--accent-brand)]"
          aria-label={`AI-derived. ${body ?? ""}${cls ? ` Confidence ${Math.round(cls.confidence * 100)}%.` : ""}`}
        >
          <Sparkles className="size-2.5" aria-hidden />
          AI
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-left">
        <p>{body ?? "AI-derived value"}</p>
        {cls && <p className="mt-1 opacity-75">Confidence {Math.round(cls.confidence * 100)}%</p>}
      </TooltipContent>
    </Tooltip>
  );
}

// ---------- score breakdown ----------
export function ScoreBreakdownContent({ b }: { b: ScoreBreakdown }) {
  const rows: [string, number, number][] = [
    ["Impact", b.impact, b.contributions.impact],
    ["Frequency", b.frequency, b.contributions.frequency],
    ["Location", b.location, b.contributions.location],
    ["SLA / time open", b.sla, b.contributions.sla],
  ];
  return (
    <div className="space-y-1.5 text-left">
      <p className="font-semibold">
        Score {round(b.score, 1)} → {b.band}
      </p>
      <table className="tabular-nums">
        <tbody>
          {rows.map(([label, v, pts]) => (
            <tr key={label}>
              <td className="pr-3">{label}</td>
              <td className="pr-3 opacity-75">{round(v, 2)}</td>
              <td className="text-right">+{round(pts, 1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="list-disc pl-4 opacity-75">
        {b.notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
    </div>
  );
}

export function ScoreWithBreakdown({ b }: { b: ScoreBreakdown }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="cursor-help rounded" aria-label={`Score ${round(b.score, 0)}, ${b.band}. Show breakdown`}>
          <PriorityBadge band={b.band} score={b.score} />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <ScoreBreakdownContent b={b} />
      </TooltipContent>
    </Tooltip>
  );
}

// ---------- layout pieces ----------
export function KpiTile({ label, value, sub, onClick }: { label: string; value: ReactNode; sub?: ReactNode; onClick?: () => void }) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      onClick={onClick}
      className={cn(
        "flex flex-col gap-1 rounded-xl border bg-card p-4 text-left shadow-xs",
        onClick && "transition-colors hover:bg-accent focus-visible:outline-2",
      )}
    >
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="text-2xl font-semibold tracking-tight">{value}</span>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </Comp>
  );
}

export function ChartCard({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("gap-3 py-4", className)}>
      <CardHeader className="px-4">
        <CardTitle className="text-sm">{title}</CardTitle>
        {description && <CardDescription className="text-xs">{description}</CardDescription>}
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      <CardContent className="px-4">{children}</CardContent>
    </Card>
  );
}

export function EmptyState({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
      {icon ?? <Inbox className="size-6" aria-hidden />}
      <p className="font-medium text-foreground">{title}</p>
      {children}
    </div>
  );
}

export function NotAvailable({ reason }: { reason: string }) {
  return (
    <EmptyState title="Not available" icon={<AlertTriangle className="size-6" aria-hidden />}>
      <p>{reason}</p>
    </EmptyState>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-muted-foreground" role="status">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {label}
    </span>
  );
}

/** Formats hours as "1.5 h", or "n/a". */
export function fmtHours(h: number | undefined, dp = 1): string {
  return h === undefined ? "n/a" : `${round(h, dp)} h`;
}

export function fmtPct(v: number | undefined, dp = 0): string {
  return v === undefined ? "n/a" : `${round(v * 100, dp)}%`;
}
