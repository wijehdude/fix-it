"use client";

import {
  AlertTriangle,
  BarChart3,
  Boxes,
  ClipboardList,
  Database,
  FileText,
  ListOrdered,
  MapPin,
  RefreshCw,
  Repeat,
  Shuffle,
  Timer,
  Users,
} from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/common/bits";
import { useDerived } from "@/hooks/useAnalysis";
import { draftCrs, fetchInsights, runPipeline } from "@/lib/pipeline/orchestrator";
import { useAnalysisStore, type DashboardTab } from "@/store/useAnalysisStore";
import { cn } from "@/lib/utils";
import { FilterBar } from "./FilterBar";
import { SettingsDrawer } from "./SettingsDrawer";
import { OverviewTab } from "./overview/OverviewTab";
import { ReclassTab } from "./reclass/ReclassTab";
import { ClustersTab } from "./clusters/ClustersTab";
import { QueueTab } from "./queue/QueueTab";
import { SlaTab } from "./sla/SlaTab";
import { LocationsTab } from "./locations/LocationsTab";
import { FunctionsTab } from "./functions/FunctionsTab";
import { ManpowerTab } from "./manpower/ManpowerTab";
import { CrsTab } from "./crs/CrsTab";
import { ExplorerTab } from "./explorer/ExplorerTab";

const TABS: { key: DashboardTab; label: string; icon: ReactNode }[] = [
  { key: "overview", label: "Overview", icon: <BarChart3 /> },
  { key: "reclass", label: "Reclassification", icon: <Shuffle /> },
  { key: "clusters", label: "Recurring Issues", icon: <Repeat /> },
  { key: "queue", label: "Priority Queue", icon: <ListOrdered /> },
  { key: "sla", label: "SLA Performance", icon: <Timer /> },
  { key: "locations", label: "Locations", icon: <MapPin /> },
  { key: "functions", label: "System Functions", icon: <Boxes /> },
  { key: "manpower", label: "Manpower Plan", icon: <Users /> },
  { key: "crs", label: "Change Requests", icon: <FileText /> },
  { key: "explorer", label: "Data Explorer", icon: <Database /> },
];

function PipelineBanner() {
  const progress = useAnalysisStore((s) => s.progress);
  const running = useAnalysisStore((s) => s.pipelineRunning);
  const error = useAnalysisStore((s) => s.pipelineError);
  const failedStages = (["classify", "embed", "summarise", "locations"] as const).filter(
    (k) => progress[k].status === "partial" || progress[k].status === "error" || progress[k].status === "cancelled",
  );
  if (running) {
    return (
      <div className="flex items-center gap-3 border-b bg-accent/50 px-4 py-2 text-sm">
        <Spinner label="Updating analysis…" />
      </div>
    );
  }
  if (!failedStages.length && !error) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 border-b bg-[color-mix(in_oklab,var(--status-warning)_15%,transparent)] px-4 py-2 text-sm" role="status">
      <AlertTriangle className="size-4" aria-hidden />
      <span>
        Showing partial results: {failedStages.map((k) => `${k} (${progress[k].failed} failed)`).join(", ") || error}. Records without AI
        results use a keyword/legacy fallback category.
      </span>
      <Button size="sm" variant="outline" className="ml-auto h-7" onClick={() => void runPipeline()}>
        <RefreshCw /> Retry failed batches
      </Button>
    </div>
  );
}

export function Dashboard() {
  const activeTab = useAnalysisStore((s) => s.activeTab);
  const set = useAnalysisStore((s) => s.set);
  const autoCrDone = useAnalysisStore((s) => s.autoCrDone);
  const insights = useAnalysisStore((s) => s.insights);
  const insightsStatus = useAnalysisStore((s) => s.insightsStatus);
  const crProgress = useAnalysisStore((s) => s.progress.crs);
  const derived = useDerived();

  // Auto-draft CRs for every P1/P2 recurring cluster once, when the dashboard first opens.
  useEffect(() => {
    if (autoCrDone) return;
    set({ autoCrDone: true });
    const targets = derived.clusters.filter((c) => c.isRecurring && (c.band === "P1" || c.band === "P2"));
    void draftCrs(targets);
  }, [autoCrDone, derived.clusters, set]);

  // Key insights (aggregate stats only), fetched once.
  useEffect(() => {
    if (insights === null && insightsStatus === "idle" && derived.records.length) void fetchInsights(derived);
  }, [insights, insightsStatus, derived]);

  return (
    <div className="flex flex-1">
      <nav aria-label="Dashboard sections" className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-52 shrink-0 border-r bg-sidebar p-2 md:block">
        <ul className="space-y-0.5" role="tablist" aria-orientation="vertical">
          {TABS.map((t) => (
            <li key={t.key}>
              <button
                role="tab"
                aria-selected={activeTab === t.key}
                aria-controls="dashboard-panel"
                id={`tab-${t.key}`}
                onClick={() => set({ activeTab: t.key })}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm [&_svg]:size-4",
                  activeTab === t.key ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground" : "text-muted-foreground hover:bg-sidebar-accent/60",
                )}
              >
                {t.icon}
                {t.label}
                {t.key === "crs" && crProgress.status === "running" && <ClipboardList className="ml-auto animate-pulse" aria-label="Drafting" />}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-14 z-20">
          <div className="flex items-center gap-2 border-b bg-background px-4 py-2 md:hidden">
            <label htmlFor="tab-select" className="sr-only">
              Section
            </label>
            <select
              id="tab-select"
              className="h-8 flex-1 rounded-md border bg-background px-2 text-sm"
              value={activeTab}
              onChange={(e) => set({ activeTab: e.target.value as DashboardTab })}
            >
              {TABS.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-start">
            <div className="min-w-0 flex-1">
              <FilterBar />
            </div>
            <div className="border-b px-3 py-2">
              <SettingsDrawer />
            </div>
          </div>
          <PipelineBanner />
        </div>
        <div id="dashboard-panel" role="tabpanel" aria-labelledby={`tab-${activeTab}`} className="min-w-0 flex-1 p-4 lg:p-6">
          {activeTab === "overview" && <OverviewTab />}
          {activeTab === "reclass" && <ReclassTab />}
          {activeTab === "clusters" && <ClustersTab />}
          {activeTab === "queue" && <QueueTab />}
          {activeTab === "sla" && <SlaTab />}
          {activeTab === "locations" && <LocationsTab />}
          {activeTab === "functions" && <FunctionsTab />}
          {activeTab === "manpower" && <ManpowerTab />}
          {activeTab === "crs" && <CrsTab />}
          {activeTab === "explorer" && <ExplorerTab />}
        </div>
      </div>
    </div>
  );
}
