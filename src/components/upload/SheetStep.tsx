"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { detectColumns } from "@/lib/parse/columns";
import { useAnalysisStore } from "@/store/useAnalysisStore";

export function SheetStep() {
  const workbook = useAnalysisStore((s) => s.workbook)!;
  const selected = useAnalysisStore((s) => s.selectedSheets);
  const set = useAnalysisStore((s) => s.set);

  const toggle = (name: string) =>
    set({ selectedSheets: selected.includes(name) ? selected.filter((n) => n !== name) : [...selected, name] });

  const next = () => {
    const sheets = workbook.sheets.filter((s) => selected.includes(s.name));
    const { mapping, detections } = detectColumns(sheets);
    set({ mapping, detections, stage: "mapping" });
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-10">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight">Select sheets</h2>
        <p className="text-muted-foreground">
          {workbook.fileName} has {workbook.sheets.length} sheet{workbook.sheets.length === 1 ? "" : "s"} with data. Each sheet name is kept
          as the record’s legacy category.
        </p>
      </div>
      <fieldset className="divide-y rounded-xl border bg-card">
        <legend className="sr-only">Sheets to include</legend>
        {workbook.sheets.map((s) => (
          <label key={s.name} className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-accent/50">
            <Checkbox checked={selected.includes(s.name)} onCheckedChange={() => toggle(s.name)} aria-label={`Include sheet ${s.name}`} />
            <span className="flex-1 font-medium">{s.name}</span>
            <span className="text-sm text-muted-foreground tabular-nums">
              {s.rows.length.toLocaleString()} rows · {s.headers.length} columns
              {s.headerRowIndex > 0 && ` · header on row ${s.headerRowIndex + 1}`}
            </span>
          </label>
        ))}
      </fieldset>
      <div className="flex justify-between">
        <Button variant="ghost" onClick={() => set({ stage: "upload", workbook: null })}>
          <ArrowLeft /> Back
        </Button>
        <Button onClick={next} disabled={!selected.length}>
          Continue to column mapping <ArrowRight />
        </Button>
      </div>
    </div>
  );
}
