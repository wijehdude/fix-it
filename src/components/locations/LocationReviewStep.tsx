"use client";

import { ArrowRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { runPipeline } from "@/lib/pipeline/orchestrator";
import { useAnalysisStore } from "@/store/useAnalysisStore";
import { LocationCriticalityTable } from "./LocationCriticalityTable";

export function LocationReviewStep() {
  const set = useAnalysisStore((s) => s.set);
  const progress = useAnalysisStore((s) => s.progress);
  const running = useAnalysisStore((s) => s.pipelineRunning);
  const anyFailed = Object.values(progress).some((p) => p.status === "partial" || p.status === "error");

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight">Review location criticality</h2>
          <p className="max-w-2xl text-muted-foreground">
            The AI rated each location High, Medium or Low. Location criticality makes up 20% of each priority score by default. Override
            any rating you disagree with (optional) — you can also do this later in the Locations tab.
          </p>
        </div>
        <div className="flex gap-2">
          {anyFailed && (
            <Button variant="outline" onClick={() => void runPipeline()} disabled={running}>
              <RefreshCw /> Retry failed batches
            </Button>
          )}
          <Button onClick={() => set({ stage: "dashboard", activeTab: "overview" })} data-testid="to-dashboard">
            Continue to dashboard <ArrowRight />
          </Button>
        </div>
      </div>
      <LocationCriticalityTable />
    </div>
  );
}
