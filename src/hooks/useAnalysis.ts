"use client";

import { useMemo } from "react";
import { deriveAnalysis, filterClusters, recordMatches, type Derived } from "@/lib/analysis/derive";
import { useAnalysisStore } from "@/store/useAnalysisStore";

/** All derived analytics, recomputed whenever inputs, overrides or settings change. */
export function useDerived(): Derived {
  const records = useAnalysisStore((s) => s.records);
  const classifications = useAnalysisStore((s) => s.classifications);
  const categoryOverrides = useAnalysisStore((s) => s.categoryOverrides);
  const clusters = useAnalysisStore((s) => s.clusters);
  const locationRatings = useAnalysisStore((s) => s.locationRatings);
  const weights = useAnalysisStore((s) => s.settings.weights);
  const minRecurringSize = useAnalysisStore((s) => s.settings.minRecurringSize);
  const referenceMode = useAnalysisStore((s) => s.settings.referenceMode);
  return useMemo(
    () =>
      deriveAnalysis({
        records,
        classifications,
        categoryOverrides,
        clusters,
        locationRatings,
        weights,
        minRecurringSize,
        referenceMode,
      }),
    [records, classifications, categoryOverrides, clusters, locationRatings, weights, minRecurringSize, referenceMode],
  );
}

/** Derived analytics plus the records/clusters that pass the global filters. */
export function useFiltered() {
  const derived = useDerived();
  const filters = useAnalysisStore((s) => s.filters);
  return useMemo(() => {
    const records = derived.records.filter((r) => recordMatches(r, filters));
    const live = records.filter((r) => !r.isDuplicate);
    const clusters = filterClusters(derived.clusters, filters);
    return { derived, filters, records, live, clusters };
  }, [derived, filters]);
}
