"use client";

import { AlertTriangle, ArrowRight, CheckCircle2, CircleDashed, Loader2, RefreshCw, Square, XCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cancelPipeline, runPipeline } from "@/lib/pipeline/orchestrator";
import { PIPELINE_STAGES, useAnalysisStore, type StageStatus } from "@/store/useAnalysisStore";

const ICON: Record<StageStatus, React.ReactNode> = {
  pending: <CircleDashed className="size-4 text-muted-foreground" aria-hidden />,
  running: <Loader2 className="size-4 animate-spin text-[var(--accent-brand)]" aria-hidden />,
  done: <CheckCircle2 className="size-4 text-[var(--status-good)]" aria-hidden />,
  partial: <AlertTriangle className="size-4 text-[var(--status-serious)]" aria-hidden />,
  error: <XCircle className="size-4 text-[var(--status-critical)]" aria-hidden />,
  cancelled: <Square className="size-4 text-muted-foreground" aria-hidden />,
  skipped: <CircleDashed className="size-4 text-muted-foreground" aria-hidden />,
};

const STATUS_TEXT: Record<StageStatus, string> = {
  pending: "Waiting",
  running: "Running",
  done: "Done",
  partial: "Partly failed",
  error: "Failed",
  cancelled: "Cancelled",
  skipped: "Skipped",
};

/** Stage list with progress bars. `compact` hides the CR stage (shown during the initial run). */
export function StageList({ includeCrs = false }: { includeCrs?: boolean }) {
  const progress = useAnalysisStore((s) => s.progress);
  return (
    <ol className="space-y-3">
      {PIPELINE_STAGES.filter((s) => includeCrs || s.key !== "crs").map(({ key, label }) => {
        const p = progress[key];
        const pct = p.total ? Math.round((p.done / p.total) * 100) : p.status === "done" ? 100 : 0;
        return (
          <li key={key} className="space-y-1.5">
            <div className="flex items-center gap-2 text-sm">
              {ICON[p.status]}
              <span className="font-medium">{label}</span>
              <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                {p.total > 1 ? `${p.done.toLocaleString()} / ${p.total.toLocaleString()}` : ""}
                {p.failed > 0 && ` · ${p.failed} failed`} · {STATUS_TEXT[p.status]}
              </span>
            </div>
            <Progress value={pct} aria-label={`${label} progress`} />
            {p.message && <p className="text-xs text-destructive">{p.message}</p>}
          </li>
        );
      })}
    </ol>
  );
}

export function ProgressPanel() {
  const running = useAnalysisStore((s) => s.pipelineRunning);
  const error = useAnalysisStore((s) => s.pipelineError);
  const progress = useAnalysisStore((s) => s.progress);
  const set = useAnalysisStore((s) => s.set);
  const anyFailed = Object.values(progress).some((p) => p.status === "partial" || p.status === "error" || p.status === "cancelled");
  const classified = progress.classify.done > 0;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-10">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight">Running analysis</h2>
        <p className="text-muted-foreground">
          Records are sent to the AI in small batches (4 at a time). You can cancel and resume; finished batches are kept.
        </p>
      </div>
      <div className="rounded-xl border bg-card p-5" aria-live="polite">
        <StageList />
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>Analysis stopped</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        {running ? (
          <Button variant="outline" onClick={cancelPipeline}>
            <Square /> Cancel
          </Button>
        ) : (
          <>
            {anyFailed && (
              <Button variant="outline" onClick={() => void runPipeline()}>
                <RefreshCw /> Retry failed batches
              </Button>
            )}
            {classified && (
              <Button onClick={() => set({ stage: "locations" })}>
                Continue with partial results <ArrowRight />
              </Button>
            )}
            {!classified && (
              <Button variant="ghost" onClick={() => set({ stage: "mapping" })}>
                Back to mapping
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
