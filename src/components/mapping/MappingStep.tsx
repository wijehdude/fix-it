"use client";

import { AlertTriangle, ArrowLeft, Play } from "lucide-react";
import { useMemo } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NativeSelect } from "@/components/common/NativeSelect";
import { CANONICAL_FIELDS, DATE_FIELDS, FIELD_LABELS, REQUIRED_FIELDS, type CanonicalField } from "@/config/columnSynonyms";
import { FILE_LIMITS } from "@/config/limits";
import { unionHeaders } from "@/lib/parse/columns";
import { combineDateAndTime, formatDateTime, parseDateValue } from "@/lib/parse/dates";
import { buildRecords } from "@/lib/parse/normalise";
import { estimateTokens, normaliseSelection, runPipeline } from "@/lib/pipeline/orchestrator";
import type { CellValue, DetectionConfidence } from "@/lib/types";
import { useAnalysisStore } from "@/store/useAnalysisStore";

const CONF_STYLE: Record<DetectionConfidence | "manual", string> = {
  high: "border-[var(--status-good)]",
  medium: "border-[var(--status-warning)]",
  low: "border-[var(--status-serious)]",
  none: "border-dashed",
  manual: "border-[var(--accent-brand)]",
};

function fmtCell(v: CellValue | undefined): string {
  if (v === null || v === undefined) return "—";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "number") return String(Math.round(v * 10_000) / 10_000);
  const s = String(v);
  return s.length > 40 ? `${s.slice(0, 39)}…` : s;
}

const DROP_LABELS: Record<string, string> = {
  blank: "blank rows",
  "repeated-header": "repeated header rows",
  "summary-row": "summary/total rows",
  "missing-description": "rows without a description",
};

export function MappingStep() {
  const workbook = useAnalysisStore((s) => s.workbook)!;
  const selected = useAnalysisStore((s) => s.selectedSheets);
  const mapping = useAnalysisStore((s) => s.mapping);
  const detections = useAnalysisStore((s) => s.detections);
  const dayFirst = useAnalysisStore((s) => s.dayFirst);
  const health = useAnalysisStore((s) => s.health);
  const set = useAnalysisStore((s) => s.set);

  const sheets = useMemo(() => workbook.sheets.filter((s) => selected.includes(s.name)), [workbook, selected]);
  const headers = useMemo(() => unionHeaders(sheets), [sheets]);

  /** First non-empty values of a column across the selected sheets. */
  const columnValues = useMemo(() => {
    const out = new Map<string, CellValue[]>();
    for (const h of headers) {
      const vals: CellValue[] = [];
      for (const sh of sheets) {
        const i = sh.headers.indexOf(h);
        if (i < 0) continue;
        for (const row of sh.rows) {
          if (row[i] !== null && row[i] !== undefined && row[i] !== "") vals.push(row[i]);
          if (vals.length >= 40) break;
        }
        if (vals.length >= 40) break;
      }
      out.set(h, vals);
    }
    return out;
  }, [headers, sheets]);

  /** Row pairs (date cell, time cell) for date previews. */
  const datePairs = (field: CanonicalField): [CellValue, CellValue][] => {
    const m = mapping[field];
    if (!m.column) return [];
    const pairs: [CellValue, CellValue][] = [];
    for (const sh of sheets) {
      const i = sh.headers.indexOf(m.column);
      const j = m.timeColumn ? sh.headers.indexOf(m.timeColumn) : -1;
      if (i < 0) continue;
      for (const row of sh.rows) {
        if (row[i] === null || row[i] === undefined) continue;
        pairs.push([row[i], j >= 0 ? row[j] : null]);
        if (pairs.length >= 5) return pairs;
      }
    }
    return pairs;
  };

  const preview = useMemo(
    () => buildRecords(sheets, mapping, { dayFirst, maxRows: FILE_LIMITS.maxRows }),
    [sheets, mapping, dayFirst],
  );
  const tokens = useMemo(() => estimateTokens(preview.records), [preview.records]);

  const setField = (field: CanonicalField, column: string | null, timeColumn?: string | null) =>
    set({ mapping: { ...mapping, [field]: { column, timeColumn: timeColumn ?? (DATE_FIELDS.includes(field) ? mapping[field].timeColumn : undefined) } } });

  const run = () => {
    if (!normaliseSelection()) return;
    set({ stage: "running" });
    void runPipeline();
  };

  const q = preview.quality;
  const missingDescription = !mapping.description.column;
  const missingReported = !mapping.reportedAt.column;
  const aiReady = health?.aiConfigured !== false;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight">Confirm column mapping</h2>
          <p className="text-muted-foreground">Columns were auto-detected. Check each field and change any that are wrong.</p>
        </div>
        <div className="flex items-center gap-2">
          <Switch id="dayfirst" checked={dayFirst} onCheckedChange={(v) => set({ dayFirst: v })} />
          <Label htmlFor="dayfirst">Dates are day-first (dd/mm/yyyy)</Label>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-48">Field</TableHead>
              <TableHead className="w-64">Source column</TableHead>
              <TableHead className="w-28">Detection</TableHead>
              <TableHead>Sample values / parsed preview</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {CANONICAL_FIELDS.map((field) => {
              const m = mapping[field];
              const det = detections.find((d) => d.field === field);
              const conf: DetectionConfidence | "manual" = m.column && det?.column !== m.column ? "manual" : (det?.confidence ?? "none");
              const isDate = DATE_FIELDS.includes(field);
              const required = REQUIRED_FIELDS.includes(field);
              const samples = m.column ? (columnValues.get(m.column) ?? []).slice(0, 3) : [];
              return (
                <TableRow key={field} className="align-top">
                  <TableCell className="font-medium whitespace-normal">
                    {FIELD_LABELS[field]}
                    {required && <span className="ml-1 text-destructive" aria-label="required">*</span>}
                    {field === "legacyCategory" && (
                      <p className="text-xs font-normal text-muted-foreground">Optional. Defaults to the sheet name.</p>
                    )}
                    {field === "reportedBy" && <p className="text-xs font-normal text-muted-foreground">Never sent to the AI.</p>}
                  </TableCell>
                  <TableCell className="space-y-2 whitespace-normal">
                    <NativeSelect
                      aria-label={`Source column for ${FIELD_LABELS[field]}`}
                      value={m.column ?? ""}
                      onChange={(e) => setField(field, e.target.value || null)}
                    >
                      <option value="">— Not mapped —</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </NativeSelect>
                    {isDate && m.column && (
                      <NativeSelect
                        aria-label={`Separate time column for ${FIELD_LABELS[field]}`}
                        value={m.timeColumn ?? ""}
                        onChange={(e) => setField(field, m.column, e.target.value || null)}
                      >
                        <option value="">No separate time column</option>
                        {headers
                          .filter((h) => h !== m.column)
                          .map((h) => (
                            <option key={h} value={h}>
                              + time from: {h}
                            </option>
                          ))}
                      </NativeSelect>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={CONF_STYLE[conf]} title={det?.reason}>
                      {conf === "none" ? (m.column ? "manual" : "not found") : conf}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs whitespace-normal">
                    {!m.column ? (
                      <span className="text-muted-foreground">
                        {required ? "Required — please choose a column." : "Not mapped"}
                      </span>
                    ) : isDate ? (
                      <ul className="space-y-0.5 tabular-nums">
                        {datePairs(field).map(([d, t], i) => {
                          const parsed = m.timeColumn ? combineDateAndTime(d, t, { dayFirst }) : parseDateValue(d, { dayFirst });
                          return (
                            <li key={i} className="flex gap-2">
                              <span className="text-muted-foreground">
                                {fmtCell(d)}
                                {m.timeColumn ? ` + ${fmtCell(t)}` : ""}
                              </span>
                              <span aria-hidden>→</span>
                              <span className={parsed ? "" : "font-medium text-destructive"}>{parsed ? formatDateTime(parsed) : "cannot parse"}</span>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <span className="text-muted-foreground">{samples.map(fmtCell).join(" · ") || "—"}</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <section aria-labelledby="dq-title" className="grid gap-4 rounded-xl border bg-card p-4 md:grid-cols-3">
        <div>
          <h3 id="dq-title" className="text-sm font-semibold">
            Data quality
          </h3>
          <dl className="mt-2 space-y-1 text-sm tabular-nums">
            <div className="flex justify-between">
              <dt>Rows read</dt>
              <dd>{q.rowsRead.toLocaleString()}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Records kept</dt>
              <dd className="font-semibold">{q.rowsKept.toLocaleString()}</dd>
            </div>
            {Object.entries(q.dropped)
              .filter(([, n]) => n > 0)
              .map(([k, n]) => (
                <div key={k} className="flex justify-between text-muted-foreground">
                  <dt>Dropped: {DROP_LABELS[k]}</dt>
                  <dd>{n}</dd>
                </div>
              ))}
            <div className="flex justify-between">
              <dt>Exact duplicates (kept, flagged)</dt>
              <dd>{q.exactDuplicates}</dd>
            </div>
            {q.truncated && <p className="text-destructive">Row limit reached — extra rows ignored.</p>}
          </dl>
        </div>
        <div>
          <h3 className="text-sm font-semibold">Missing values</h3>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm tabular-nums">
            {CANONICAL_FIELDS.filter((f) => mapping[f].column && f !== "legacyCategory").map((f) => (
              <div key={f} className="flex justify-between gap-2">
                <dt className="truncate">{FIELD_LABELS[f]}</dt>
                <dd className={(q.missingPct[f] ?? 0) > 20 ? "text-destructive" : "text-muted-foreground"}>
                  {Math.round(q.missingPct[f] ?? 0)}%
                </dd>
              </div>
            ))}
          </dl>
          {Object.entries(q.unparseableDates).some(([, n]) => (n ?? 0) > 0) && (
            <p className="mt-2 text-xs text-destructive">
              Unparseable dates:{" "}
              {Object.entries(q.unparseableDates)
                .map(([f, n]) => `${FIELD_LABELS[f as CanonicalField]} ${n}`)
                .join(", ")}
            </p>
          )}
        </div>
        <div>
          <h3 className="text-sm font-semibold">Estimated AI usage</h3>
          <p className="mt-2 text-sm tabular-nums">
            ≈ {Math.round(tokens.total / 1000).toLocaleString()}k tokens ({Math.round(tokens.input / 1000)}k in /{" "}
            {Math.round(tokens.output / 1000)}k out) across ≈ {tokens.requests} requests.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Rough estimate for classification, embeddings, cluster summaries and CRs. Model: {health?.mock ? "demo mode (simulated, no cost)" : (health?.model ?? "server default")}.
          </p>
        </div>
      </section>

      {(missingDescription || missingReported) && (
        <Alert variant={missingDescription ? "destructive" : "default"}>
          <AlertTriangle />
          <AlertTitle>{missingDescription ? "Description is required" : "No reported date/time"}</AlertTitle>
          <AlertDescription>
            {missingDescription
              ? "Map a description column to run the analysis."
              : "The analysis will run, but SLA, trend and manpower views will show “not available”."}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex justify-between">
        <Button variant="ghost" onClick={() => set({ stage: "sheets" })}>
          <ArrowLeft /> Back
        </Button>
        <Button onClick={run} disabled={missingDescription || !q.rowsKept || !aiReady} data-testid="run-analysis">
          <Play /> Run analysis on {q.rowsKept.toLocaleString()} records
        </Button>
      </div>
    </div>
  );
}
