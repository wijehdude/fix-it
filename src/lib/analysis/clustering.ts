/**
 * Agglomerative clustering on cosine similarity with average linkage.
 *
 * Uses the nearest-neighbour-chain algorithm (O(n²) time, O(n²) memory), which is exact
 * for average linkage because it is a reducible linkage. Merges are recorded, then the
 * dendrogram is cut at distance (1 − threshold): average linkage is monotone, so applying
 * every merge at or below the cut yields exactly the threshold clusters.
 */

export function l2Normalise(v: ArrayLike<number>): Float32Array {
  let n = 0;
  for (let i = 0; i < v.length; i++) n += v[i] * v[i];
  const inv = n > 0 ? 1 / Math.sqrt(n) : 0;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] * inv;
  return out;
}

export function cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / Math.sqrt(na * nb);
}

/** Returns a cluster label (0-based, dense) for each vector. */
export function agglomerativeCluster(vectors: ArrayLike<number>[], similarityThreshold: number): number[] {
  const n = vectors.length;
  if (n === 0) return [];
  if (n === 1) return [0];
  const unit = vectors.map(l2Normalise);
  const dim = unit[0].length;

  // Distance matrix (1 − cosine).
  const D = new Float32Array(n * n);
  for (let i = 0; i < n; i++) {
    const a = unit[i];
    for (let j = i + 1; j < n; j++) {
      const b = unit[j];
      let dot = 0;
      for (let k = 0; k < dim; k++) dot += a[k] * b[k];
      const d = 1 - dot;
      D[i * n + j] = d;
      D[j * n + i] = d;
    }
  }

  const size = new Int32Array(n).fill(1);
  const active = new Uint8Array(n).fill(1);
  const merges: { a: number; b: number; d: number }[] = [];
  const chain: number[] = [];
  let remaining = n;

  while (remaining > 1) {
    if (chain.length === 0) {
      for (let i = 0; i < n; i++) {
        if (active[i]) {
          chain.push(i);
          break;
        }
      }
    }
    // Grow the chain until a reciprocal nearest-neighbour pair is found.
    for (;;) {
      const a = chain[chain.length - 1];
      const prev = chain.length >= 2 ? chain[chain.length - 2] : -1;
      let best = prev;
      let bestD = prev >= 0 ? D[a * n + prev] : Infinity;
      const row = a * n;
      for (let j = 0; j < n; j++) {
        if (j === a || !active[j]) continue;
        const d = D[row + j];
        if (d < bestD) {
          bestD = d;
          best = j;
        }
      }
      if (best === prev) break;
      chain.push(best);
    }
    const a = chain.pop()!;
    const b = chain.pop()!;
    const dAB = D[a * n + b];
    merges.push({ a, b, d: dAB });
    // Lance–Williams update for average linkage; the merged cluster lives at index b.
    const sa = size[a];
    const sb = size[b];
    for (let k = 0; k < n; k++) {
      if (!active[k] || k === a || k === b) continue;
      const d = (sa * D[a * n + k] + sb * D[b * n + k]) / (sa + sb);
      D[b * n + k] = d;
      D[k * n + b] = d;
    }
    active[a] = 0;
    size[b] = sa + sb;
    remaining--;
  }

  // Cut the dendrogram with union-find.
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const cut = 1 - similarityThreshold + 1e-9;
  for (const m of merges) {
    if (m.d <= cut) {
      const ra = find(m.a);
      const rb = find(m.b);
      if (ra !== rb) parent[ra] = rb;
    }
  }
  const labelOf = new Map<number, number>();
  return Array.from({ length: n }, (_, i) => {
    const r = find(i);
    if (!labelOf.has(r)) labelOf.set(r, labelOf.size);
    return labelOf.get(r)!;
  });
}

/**
 * Location repeats: records with the same category and normalised location where at least
 * `minRecords` non-duplicate records fall within `windowDays` of each other.
 * Returns the set of record ids that are part of such a repeat.
 */
export function findLocationRepeats(
  records: { id: string; category: string; location?: string; reportedAt?: Date; isDuplicate: boolean }[],
  minRecords: number,
  windowDays: number,
): Set<string> {
  const windowMs = windowDays * 86_400_000;
  const groups = new Map<string, { id: string; t: number }[]>();
  for (const r of records) {
    if (r.isDuplicate || !r.location || !r.reportedAt) continue;
    const key = `${r.category}|${r.location}`;
    const arr = groups.get(key) ?? [];
    arr.push({ id: r.id, t: r.reportedAt.getTime() });
    groups.set(key, arr);
  }
  const out = new Set<string>();
  for (const arr of groups.values()) {
    if (arr.length < minRecords) continue;
    arr.sort((a, b) => a.t - b.t);
    // Sliding window: every window containing ≥ minRecords marks all its members.
    let lo = 0;
    for (let hi = 0; hi < arr.length; hi++) {
      while (arr[hi].t - arr[lo].t > windowMs) lo++;
      if (hi - lo + 1 >= minRecords) for (let k = lo; k <= hi; k++) out.add(arr[k].id);
    }
  }
  return out;
}
