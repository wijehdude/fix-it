"use client";

import { FileSpreadsheet, ShieldAlert, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/common/bits";
import { FILE_LIMITS } from "@/config/limits";
import { parseWorkbook } from "@/lib/parse/workbook";
import { useAnalysisStore } from "@/store/useAnalysisStore";
import { cn } from "@/lib/utils";

export function UploadStep() {
  const consentGiven = useAnalysisStore((s) => s.consentGiven);
  const health = useAnalysisStore((s) => s.health);
  const set = useAnalysisStore((s) => s.set);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (file: File | Blob, name: string) => {
    setError(null);
    if (!FILE_LIMITS.acceptedExtensions.some((ext) => name.toLowerCase().endsWith(ext))) {
      return setError(`Unsupported file type. Please upload ${FILE_LIMITS.acceptedExtensions.join(", ")}.`);
    }
    if (file.size > FILE_LIMITS.maxBytes) {
      return setError(`File is ${(file.size / 1024 / 1024).toFixed(1)} MB; the limit is ${FILE_LIMITS.maxBytes / 1024 / 1024} MB.`);
    }
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      // Yield so the spinner paints before the (synchronous) parse.
      await new Promise((r) => setTimeout(r, 0));
      const wb = parseWorkbook(buf, name);
      if (!wb.sheets.length) throw new Error("The file has no sheets with data.");
      const totalRows = wb.sheets.reduce((a, s) => a + s.rows.length, 0);
      set({
        workbook: wb,
        fileSize: file.size,
        selectedSheets: wb.sheets.map((s) => s.name),
        stage: "sheets",
      });
      if (totalRows > FILE_LIMITS.maxRows) {
        setError(`Note: the file has ${totalRows.toLocaleString()} rows; only the first ${FILE_LIMITS.maxRows.toLocaleString()} records will be analysed.`);
      }
    } catch (e) {
      setError(e instanceof Error ? `Could not read the file: ${e.message}` : "Could not read the file.");
    } finally {
      setBusy(false);
    }
  };

  const onFiles = (files: FileList | null) => {
    const f = files?.[0];
    if (f) void load(f, f.name);
  };

  const loadSample = async () => {
    setBusy(true);
    try {
      const res = await fetch("/sample/sample-defects.xlsx");
      if (!res.ok) throw new Error("Sample file not found");
      const blob = await res.blob();
      await load(blob, "sample-defects.xlsx");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the sample file.");
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-10">
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight">Analyse a defect workbook</h2>
        <p className="text-muted-foreground">
          Upload an Excel or CSV defect log. The app classifies every record into the new categories, consolidates recurring issues,
          scores priority, checks the 2 h response / 4 h turnaround SLA, drafts change requests and plans manpower.
        </p>
      </div>

      {health && !health.aiConfigured && (
        <Alert variant="destructive">
          <ShieldAlert />
          <AlertTitle>AI is not configured</AlertTitle>
          <AlertDescription>The server has no OpenAI API key configured. You can map and preview data, but the analysis cannot run.</AlertDescription>
        </Alert>
      )}

      <Alert>
        <ShieldAlert />
        <AlertTitle>Data notice</AlertTitle>
        <AlertDescription>
          <p>
            Defect descriptions, locations and remarks will be sent to OpenAI for processing. Do not upload classified or personal data.
          </p>
          <p>
            The file itself is parsed in your browser and never uploaded. Reporter names and unmapped columns are never sent; emails, phone
            numbers and NRIC-like IDs are stripped first. Nothing is stored: closing or refreshing this tab discards everything.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <Checkbox id="consent" checked={consentGiven} onCheckedChange={(v) => set({ consentGiven: v === true })} />
            <Label htmlFor="consent" className="font-medium text-foreground">
              I understand
            </Label>
          </div>
        </AlertDescription>
      </Alert>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (consentGiven) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (consentGiven) onFiles(e.dataTransfer.files);
        }}
        className={cn(
          "flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 text-center transition-colors",
          dragging && "border-[var(--accent-brand)] bg-accent",
          !consentGiven && "opacity-50",
        )}
      >
        <FileSpreadsheet className="size-10 text-muted-foreground" aria-hidden />
        <p className="text-sm">
          Drag and drop a file here, or choose one. <span className="text-muted-foreground">.xlsx, .xls or .csv · up to 10 MB / 10,000 rows</span>
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={() => inputRef.current?.click()} disabled={!consentGiven || busy}>
            <Upload /> Choose file
          </Button>
          <Button variant="outline" onClick={loadSample} disabled={!consentGiven || busy}>
            Use sample data
          </Button>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="sr-only"
          aria-label="Upload defect workbook"
          data-testid="file-input"
          onChange={(e) => onFiles(e.target.files)}
        />
        {busy && <Spinner label="Reading file…" />}
        {!consentGiven && <p className="text-xs text-muted-foreground">Tick “I understand” above to continue.</p>}
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
