"use client";

import { RefreshCw, RotateCcw, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { NativeSelect } from "@/components/common/NativeSelect";
import { CLUSTERING_CONFIG, DEFAULT_WEIGHTS, PRIORITY_BANDS, type ScoringWeights } from "@/config/scoring";
import { normaliseWeights } from "@/lib/analysis/scoring";
import { recluster } from "@/lib/pipeline/orchestrator";
import { useAnalysisStore } from "@/store/useAnalysisStore";

const WEIGHT_LABELS: Record<keyof ScoringWeights, string> = {
  impact: "Operational impact",
  frequency: "Frequency / recurrence",
  location: "Location criticality",
  sla: "SLA breach / time open",
};

export function SettingsDrawer() {
  const settings = useAnalysisStore((s) => s.settings);
  const setSettings = useAnalysisStore((s) => s.setSettings);
  const running = useAnalysisStore((s) => s.pipelineRunning);
  const [threshold, setThreshold] = useState(settings.similarityThreshold);
  const w = normaliseWeights(settings.weights);

  /** Changing one weight rescales the others so the total stays 1. */
  const setWeight = (key: keyof ScoringWeights, value: number) => {
    const others = (Object.keys(w) as (keyof ScoringWeights)[]).filter((k) => k !== key);
    const rest = others.reduce((a, k) => a + w[k], 0);
    const next = { ...w, [key]: value };
    for (const k of others) next[k] = rest > 0 ? (w[k] / rest) * (1 - value) : (1 - value) / others.length;
    setSettings({ weights: normaliseWeights(next) });
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          <SlidersHorizontal /> Scoring settings
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[380px] overflow-y-auto sm:max-w-[380px]">
        <SheetHeader>
          <SheetTitle>Scoring settings</SheetTitle>
          <SheetDescription>
            Weights always sum to 100%. Scores and rankings update live. Bands: P1 ≥ {PRIORITY_BANDS.P1}, P2 ≥ {PRIORITY_BANDS.P2}, P3 ≥{" "}
            {PRIORITY_BANDS.P3}, P4 below.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-6 px-4 pb-6">
          {(Object.keys(WEIGHT_LABELS) as (keyof ScoringWeights)[]).map((k) => (
            <div key={k} className="space-y-2">
              <div className="flex justify-between text-sm">
                <Label id={`w-${k}`}>{WEIGHT_LABELS[k]}</Label>
                <span className="tabular-nums">{Math.round(w[k] * 100)}%</span>
              </div>
              <Slider
                aria-labelledby={`w-${k}`}
                min={0}
                max={1}
                step={0.01}
                value={[w[k]]}
                onValueChange={([v]) => setWeight(k, v)}
              />
            </div>
          ))}
          <Button variant="ghost" size="sm" onClick={() => setSettings({ weights: DEFAULT_WEIGHTS })}>
            <RotateCcw /> Reset weights (35 / 25 / 20 / 20)
          </Button>

          <Separator />

          <div className="space-y-2">
            <Label htmlFor="refmode">Reference date for open-item ageing</Label>
            <NativeSelect
              id="refmode"
              value={settings.referenceMode}
              onChange={(e) => setSettings({ referenceMode: e.target.value as "dataset" | "now" })}
            >
              <option value="dataset">Latest timestamp in the data (default)</option>
              <option value="now">Now</option>
            </NativeSelect>
          </div>

          <div className="space-y-2">
            <Label htmlFor="minsize">Minimum reports for a recurring issue</Label>
            <NativeSelect
              id="minsize"
              value={String(settings.minRecurringSize)}
              onChange={(e) => setSettings({ minRecurringSize: Number(e.target.value) })}
            >
              {[2, 3, 4, 5, 6, 8, 10].map((n) => (
                <option key={n} value={n}>
                  {n}
                  {n === CLUSTERING_CONFIG.minRecurringSize ? " (default)" : ""}
                </option>
              ))}
            </NativeSelect>
          </div>

          <Separator />

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <Label id="thr">Clustering similarity threshold</Label>
              <span className="tabular-nums">{threshold.toFixed(2)}</span>
            </div>
            <Slider aria-labelledby="thr" min={0.6} max={0.98} step={0.01} value={[threshold]} onValueChange={([v]) => setThreshold(v)} />
            <p className="text-xs text-muted-foreground">
              Higher = stricter (smaller, tighter clusters). Default {CLUSTERING_CONFIG.similarityThreshold}. Re-clustering reuses cached
              embeddings and summarises only new recurring clusters. It also applies any category overrides.
            </p>
            <Button
              size="sm"
              variant="outline"
              disabled={running}
              onClick={() => {
                setSettings({ similarityThreshold: threshold });
                void recluster();
              }}
            >
              <RefreshCw /> Apply and re-cluster
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
