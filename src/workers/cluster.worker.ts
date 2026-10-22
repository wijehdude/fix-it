/// <reference lib="webworker" />
import { agglomerativeCluster } from "@/lib/analysis/clustering";

export type ClusterWorkerRequest = {
  threshold: number;
  groups: { key: string; vectors: Float32Array[] }[];
};
export type ClusterWorkerResponse = { labels: Record<string, number[]> } | { error: string };

self.onmessage = (e: MessageEvent<ClusterWorkerRequest>) => {
  try {
    const labels: Record<string, number[]> = {};
    for (const g of e.data.groups) labels[g.key] = agglomerativeCluster(g.vectors, e.data.threshold);
    (self as unknown as Worker).postMessage({ labels } satisfies ClusterWorkerResponse);
  } catch (err) {
    (self as unknown as Worker).postMessage({ error: err instanceof Error ? err.message : "Clustering failed" } satisfies ClusterWorkerResponse);
  }
};
