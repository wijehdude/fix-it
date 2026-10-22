"use client";

import { AlertTriangle, CheckCircle2, PhoneCall } from "lucide-react";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChartCard, EmptyState, NotAvailable } from "@/components/common/bits";
import { seqColor, seqTextClass } from "@/components/common/chart";
import { NativeSelect } from "@/components/common/NativeSelect";
import { MANPOWER_CONFIG, type ShiftDef } from "@/config/shifts";
import { useFiltered } from "@/hooks/useAnalysis";
import { computeManpower, DAY_NAMES, DAY_ORDER, shiftHours, type ManpowerResult, type ShiftCell } from "@/lib/analysis/manpower";
import { round } from "@/lib/analysis/stats";
import { useAnalysisStore } from "@/store/useAnalysisStore";

const pad = (n: number) => String(n).padStart(2, "0");
const HOURS = Array.from({ length: 24 }, (_, h) => h);

function Heatmap({ result }: { result: ManpowerResult }) {
  const [trade, setTrade] = useState("All");
  const [metric, setMetric] = useState<"count" | "hours">("count");
  const grid = result.heatmap[trade] ?? result.heatmap.All;
  const max = Math.max(0, ...grid.flat().map((c) => (metric === "count" ? c.count : c.hours)));
  const fmt = (v: number) => (metric === "count" ? String(v) : String(round(v, 1)));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-56">
          <NativeSelect aria-label="Trade for heatmap" value={trade} onChange={(e) => setTrade(e.target.value)}>
            <option value="All">All trades</option>
            {result.trades.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="w-48">
          <NativeSelect aria-label="Heatmap measure" value={metric} onChange={(e) => setMetric(e.target.value as "count" | "hours")}>
            <option value="count">Defect count</option>
            <option value="hours">Man-hours</option>
          </NativeSelect>
        </div>
        <span className="text-xs text-muted-foreground">Total over {result.weeks} weeks, by reported time.</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-separate text-[10px] tabular-nums" style={{ borderSpacing: 2 }}>
          <caption className="sr-only">
            {metric === "count" ? "Defect count" : "Man-hours"} by day of week and hour of day for {trade === "All" ? "all trades" : trade}
          </caption>
          <thead>
            <tr>
              <th scope="col" className="w-10" />
              {HOURS.map((h) => (
                <th key={h} scope="col" className="font-normal text-muted-foreground">
                  {h % 2 === 0 ? pad(h) : ""}
                  <span className="sr-only">{pad(h)}:00</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DAY_ORDER.map((dow) => (
              <tr key={dow}>
                <th scope="row" className="pr-1 text-left text-xs font-normal text-muted-foreground">
                  {DAY_NAMES[dow]}
                </th>
                {HOURS.map((h) => {
                  const cell = grid[dow][h];
                  const v = metric === "count" ? cell.count : cell.hours;
                  return (
                    <td
                      key={h}
                      title={`${DAY_NAMES[dow]} ${pad(h)}:00–${pad((h + 1) % 24)}:00 · ${cell.count} defects · ${round(cell.hours, 1)} man-hours`}
                      className={`h-7 min-w-6 rounded-[3px] text-center ${seqTextClass(v, max)}`}
                      style={{ background: seqColor(v, max) }}
                    >
                      {v > 0 ? fmt(v) : ""}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground" aria-hidden>
        <span>Low</span>
        {[1, 2, 3, 4, 5, 6, 7].map((s) => (
          <span key={s} className="h-3 w-6 rounded-[2px]" style={{ background: `var(--seq-${s})` }} />
        ))}
        <span>High (max {fmt(max)})</span>
      </div>
    </div>
  );
}

function CellNote({ cell }: { cell: ShiftCell }) {
  if (cell.slaRisk) {
    return (
      <span className="flex items-start gap-1 font-medium text-foreground">
        <AlertTriangle className="mt-0.5 size-3 shrink-0 text-[var(--status-critical)]" aria-hidden />
        {cell.note}
      </span>
    );
  }
  if (cell.headcount === 0 && cell.totalHours > 0) {
    return (
      <span className="flex items-start gap-1">
        <PhoneCall className="mt-0.5 size-3 shrink-0" aria-hidden />
        {cell.note}
      </span>
    );
  }
  if (cell.totalHours > 0) {
    return (
      <span className="flex items-start gap-1">
        <CheckCircle2 className="mt-0.5 size-3 shrink-0 text-[var(--status-good)]" aria-hidden />
        {cell.note}
      </span>
    );
  }
  return <span>{cell.note}</span>;
}

function HeadcountTable({ result, shifts }: { result: ManpowerResult; shifts: ShiftDef[] }) {
  const cell = (trade: string, shift: string) => result.table.find((c) => c.trade === trade && c.shift === shift);
  const totals = shifts.map((s) => result.table.filter((c) => c.shift === s.name).reduce((a, c) => a + c.headcount, 0));
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Trade</TableHead>
            {shifts.map((s) => (
              <TableHead key={s.name} className="min-w-52">
                {s.name} <span className="font-normal text-muted-foreground">({pad(s.startHour)}:00–{pad(s.endHour)}:00)</span>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {result.trades.map((t) => (
            <TableRow key={t} className="align-top">
              <TableCell className="font-medium">{t}</TableCell>
              {shifts.map((s) => {
                const c = cell(t, s.name);
                if (!c) return <TableCell key={s.name}>—</TableCell>;
                return (
                  <TableCell key={s.name} className="whitespace-normal">
                    <div className="flex items-baseline gap-2">
                      <span className="text-xl font-semibold tabular-nums">{c.headcount}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {round(c.demandUsed, 2)} h/shift · FTE {round(c.fte, 2)}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      <CellNote cell={c} />
                    </div>
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell className="font-semibold">Total headcount</TableCell>
            {totals.map((t, i) => (
              <TableCell key={shifts[i].name} className="text-xl font-semibold tabular-nums">
                {t}
              </TableCell>
            ))}
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}

function HoursInput({ trade, value, onChange }: { trade: string; value: number | undefined; onChange: (v: number | undefined) => void }) {
  return (
    <Input
      type="number"
      min={0.1}
      max={24}
      step={0.25}
      className="h-8 w-20 tabular-nums"
      aria-label={`Man-hours per job for ${trade}`}
      placeholder="—"
      value={value ?? ""}
      onChange={(e) => {
        const v = e.target.value === "" ? undefined : Number(e.target.value);
        onChange(v !== undefined && Number.isFinite(v) && v > 0 ? v : undefined);
      }}
    />
  );
}

function Assumptions({ result }: { result: ManpowerResult }) {
  const m = useAnalysisStore((s) => s.settings.manpower);
  const setManpower = useAnalysisStore((s) => s.setManpower);

  const setOverride = (trade: string, v: number | undefined) => {
    const next = { ...m.hoursOverride };
    if (v === undefined) delete next[trade];
    else next[trade] = v;
    setManpower({ hoursOverride: next });
  };
  const setShift = (i: number, patch: Partial<ShiftDef>) => setManpower({ shifts: m.shifts.map((s, j) => (j === i ? { ...s, ...patch } : s)) });

  return (
    <div className="space-y-5">
      <div className="grid gap-5 md:grid-cols-3">
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <Label id="util-label">Utilisation</Label>
            <span className="tabular-nums">{Math.round(m.utilisation * 100)}%</span>
          </div>
          <Slider aria-labelledby="util-label" min={0.4} max={1} step={0.05} value={[m.utilisation]} onValueChange={([v]) => setManpower({ utilisation: v })} />
          <p className="text-xs text-muted-foreground">Share of a shift spent on defect jobs (default {MANPOWER_CONFIG.utilisation * 100}%).</p>
        </div>
        <div className="flex items-start gap-2">
          <Switch id="peak" checked={m.planForPeak} onCheckedChange={(v) => setManpower({ planForPeak: v })} />
          <div>
            <Label htmlFor="peak">Plan for peak (P85 week)</Label>
            <p className="text-xs text-muted-foreground">Use the 85th-percentile week instead of the average week.</p>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <Switch id="observed" checked={m.useObservedHours} onCheckedChange={(v) => setManpower({ useObservedHours: v })} />
          <div>
            <Label htmlFor="observed">Use observed man-hours</Label>
            <p className="text-xs text-muted-foreground">
              Median (completed − responded) per trade, clamped to 0.25–8 h, when there are ≥ {MANPOWER_CONFIG.minObservationsForOverride}{" "}
              observations.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div>
          <h4 className="mb-2 text-sm font-semibold">Man-hours per job</h4>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Trade</TableHead>
                <TableHead className="text-right">Default</TableHead>
                <TableHead className="text-right">Observed</TableHead>
                <TableHead>Override</TableHead>
                <TableHead>Used</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.trades.map((t) => {
                const th = result.tradeHours[t];
                return (
                  <TableRow key={t}>
                    <TableCell className="font-medium">{t}</TableCell>
                    <TableCell className="text-right tabular-nums">{th.defaultHours} h</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {th.observedMedian !== undefined ? `${round(th.observedMedian, 2)} h` : "n/a"}
                      <span className="ml-1 text-xs text-muted-foreground">(n={th.observedCount})</span>
                    </TableCell>
                    <TableCell>
                      <HoursInput trade={t} value={m.hoursOverride[t]} onChange={(v) => setOverride(t, v)} />
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {round(th.used, 2)} h <span className="text-xs text-muted-foreground">({th.source})</span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <div>
          <h4 className="mb-2 text-sm font-semibold">Shifts</h4>
          <div className="space-y-2">
            {m.shifts.map((s, i) => (
              <div key={i} className="grid grid-cols-[1fr_6rem_6rem_4rem] items-center gap-2">
                <Input className="h-8" aria-label={`Shift ${i + 1} name`} value={s.name} onChange={(e) => setShift(i, { name: e.target.value })} />
                <NativeSelect aria-label={`${s.name} start hour`} value={String(s.startHour)} onChange={(e) => setShift(i, { startHour: Number(e.target.value) })}>
                  {HOURS.map((h) => (
                    <option key={h} value={h}>
                      {pad(h)}:00
                    </option>
                  ))}
                </NativeSelect>
                <NativeSelect aria-label={`${s.name} end hour`} value={String(s.endHour)} onChange={(e) => setShift(i, { endHour: Number(e.target.value) })}>
                  {HOURS.map((h) => (
                    <option key={h} value={h}>
                      {pad(h)}:00
                    </option>
                  ))}
                </NativeSelect>
                <span className="text-xs text-muted-foreground tabular-nums">{shiftHours(s)} h</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Shifts may wrap past midnight. Hours not covered by any shift are excluded from headcount. Dataset spans {result.weeks} week
            {result.weeks === 1 ? "" : "s"}.
          </p>
        </div>
      </div>
    </div>
  );
}

export function ManpowerTab() {
  const { live } = useFiltered();
  const settings = useAnalysisStore((s) => s.settings.manpower);

  const result = useMemo(
    () =>
      computeManpower(
        live.map((r) => ({ trade: r.trade, reportedAt: r.reportedAt, respondedAt: r.respondedAt, completedAt: r.completedAt, isDuplicate: r.isDuplicate })),
        settings,
      ),
    [live, settings],
  );

  if (!live.length) return <EmptyState title="No records match the current filters" />;
  if (result.weeks === 0) return <NotAvailable reason="No reported date/time is mapped, so workload by time and headcount cannot be computed." />;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Manpower plan</h2>
        <p className="text-sm text-muted-foreground">
          Workload by trade and the recommended headcount per shift, from {live.length.toLocaleString()} records over {result.weeks} weeks
          {result.jobsWithoutTime > 0 && ` (${result.jobsWithoutTime} without a reported time excluded)`}.
        </p>
      </div>

      <ChartCard title="Recommended headcount per trade per shift" description={settings.planForPeak ? "Planning for the P85 week." : "Planning for the average week."}>
        <HeadcountTable result={result} shifts={settings.shifts} />
        <p className="mt-3 text-xs text-muted-foreground">
          Headcount = max(ceil(FTE − 0.1), coverage minimum). FTE = demand per shift ÷ (shift hours × utilisation), where demand per shift is
          the weekly man-hours in that shift ÷ 7. Coverage minimum = 1 if the trade has demand in that shift in ≥{" "}
          {MANPOWER_CONFIG.coverageWeekShare * 100}% of weeks (to meet the 2 h response SLA), otherwise 0 (on-call). “SLA risk” means the
          busiest 2-hour window needs more man-hours than the rostered headcount can deliver.
        </p>
      </ChartCard>

      <ChartCard title="Workload heatmap" description="Day of week × hour of day.">
        <Heatmap result={result} />
      </ChartCard>

      <ChartCard title="Assumptions" description="Changes update the plan immediately (this session only).">
        <Assumptions result={result} />
      </ChartCard>
    </div>
  );
}
