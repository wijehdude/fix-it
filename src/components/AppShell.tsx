"use client";

import { Activity, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { UploadStep } from "@/components/upload/UploadStep";
import { SheetStep } from "@/components/upload/SheetStep";
import { MappingStep } from "@/components/mapping/MappingStep";
import { ProgressPanel } from "@/components/progress/ProgressPanel";
import { LocationReviewStep } from "@/components/locations/LocationReviewStep";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { AccessGate } from "@/components/upload/AccessGate";
import { formatDateTime } from "@/lib/parse/dates";
import { cancelPipeline } from "@/lib/pipeline/orchestrator";
import { clearCaches } from "@/lib/pipeline/cache";
import { useDerived } from "@/hooks/useAnalysis";
import { useAnalysisStore } from "@/store/useAnalysisStore";
import type { HealthResponse } from "@/lib/api/contracts";

const STEP_LABELS = ["Upload", "Sheets", "Mapping", "Analyse", "Locations", "Dashboard"] as const;
const STEP_INDEX = { upload: 0, sheets: 1, mapping: 2, running: 3, locations: 4, dashboard: 5 } as const;

function HeaderMeta() {
  const derived = useDerived();
  const fileName = useAnalysisStore((s) => s.workbook?.fileName);
  const referenceMode = useAnalysisStore((s) => s.settings.referenceMode);
  return (
    <div className="hidden min-w-0 items-center gap-4 text-xs text-muted-foreground md:flex">
      <span className="truncate" title={fileName}>
        <span className="font-medium text-foreground">{fileName}</span>
      </span>
      <span className="tabular-nums">{derived.records.length.toLocaleString()} records</span>
      <span>
        Reference date: <span className="tabular-nums">{formatDateTime(derived.referenceDate)}</span>
        {referenceMode === "dataset" ? " (latest in data)" : " (now)"}
      </span>
    </div>
  );
}

export function AppShell() {
  const stage = useAnalysisStore((s) => s.stage);
  const hasData = useAnalysisStore((s) => s.records.length > 0 || s.workbook !== null);
  const health = useAnalysisStore((s) => s.health);
  const set = useAnalysisStore((s) => s.set);
  const resetAll = useAnalysisStore((s) => s.resetAll);
  const [confirmReset, setConfirmReset] = useState(false);

  // Warn before refresh/close once data exists (nothing is persisted).
  useEffect(() => {
    if (!hasData) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasData]);

  // Discover server configuration (AI key present, access code required).
  useEffect(() => {
    if (health) return;
    fetch("/api/health", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<HealthResponse>) : null))
      .then((h) => h && set({ health: h }))
      .catch(() => undefined);
  }, [health, set]);

  const doReset = () => {
    cancelPipeline();
    clearCaches();
    resetAll();
    setConfirmReset(false);
  };

  const stepIdx = STEP_INDEX[stage];

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background/95 px-4 backdrop-blur">
        <div className="flex items-center gap-2">
          <Activity className="size-5 text-[var(--accent-brand)]" aria-hidden />
          <h1 className="text-sm font-semibold whitespace-nowrap">C3 Defect Intelligence</h1>
        </div>
        {stage === "dashboard" ? (
          <HeaderMeta />
        ) : (
          <ol className="hidden items-center gap-1 text-xs lg:flex" aria-label="Progress">
            {STEP_LABELS.map((label, i) => (
              <li key={label} className="flex items-center gap-1">
                <span
                  className={
                    i === stepIdx
                      ? "rounded-full bg-primary px-2 py-0.5 font-medium text-primary-foreground"
                      : i < stepIdx
                        ? "px-2 py-0.5 text-foreground"
                        : "px-2 py-0.5 text-muted-foreground"
                  }
                  aria-current={i === stepIdx ? "step" : undefined}
                >
                  {i + 1}. {label}
                </span>
                {i < STEP_LABELS.length - 1 && <span className="text-muted-foreground" aria-hidden>›</span>}
              </li>
            ))}
          </ol>
        )}
        <div className="ml-auto flex items-center gap-2">
          {hasData && (
            <Button variant="outline" size="sm" onClick={() => setConfirmReset(true)}>
              <RotateCcw /> New analysis
            </Button>
          )}
          <ThemeToggle />
        </div>
      </header>

      {health?.mock && (
        <div className="border-b bg-[color-mix(in_oklab,var(--status-warning)_20%,transparent)] px-4 py-1.5 text-center text-xs" role="status">
          <strong>Demo mode:</strong> AI results are simulated offline with keyword rules (no OpenAI calls). Configure an OpenAI API key and
          unset MOCK_AI for real analysis.
        </div>
      )}
      <main className="flex flex-1 flex-col">
        <AccessGate>
          {stage === "upload" && <UploadStep />}
          {stage === "sheets" && <SheetStep />}
          {stage === "mapping" && <MappingStep />}
          {stage === "running" && <ProgressPanel />}
          {stage === "locations" && <LocationReviewStep />}
          {stage === "dashboard" && <Dashboard />}
        </AccessGate>
      </main>

      <Dialog open={confirmReset} onOpenChange={setConfirmReset}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start a new analysis?</DialogTitle>
            <DialogDescription>
              This clears the current file, results, overrides and change requests from this browser tab. Nothing is saved anywhere, so
              this cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmReset(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={doReset}>
              Clear and start again
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
