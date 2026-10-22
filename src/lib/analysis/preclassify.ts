import type { Category } from "@/config/categories";
import { CATEGORY_KEYWORDS, KEYWORD_CONFIDENCE, LEGACY_CATEGORY_ALIASES } from "@/config/keywords";

export type KeywordResult = {
  category: Exclude<Category, "Others"> | null;
  score: number;
  margin: number;
  highConfidence: boolean;
};

/** Maps a legacy sheet/category name to a specific new category, or null for Others/unknown. */
export function legacyToCategory(legacy: string): Exclude<Category, "Others"> | null {
  const s = legacy.trim();
  if (!s || /other|misc|general/i.test(s)) return null;
  for (const a of LEGACY_CATEGORY_ALIASES) if (a.pattern.test(s)) return a.category;
  return null;
}

/** Keyword scoring over description + location + asset. Toilet location takes precedence over Cleaning. */
export function keywordClassify(text: { description: string; location?: string; asset?: string }): KeywordResult {
  const haystack = `${text.description} ${text.asset ?? ""}`;
  const scores = new Map<Exclude<Category, "Others">, number>();
  for (const [cat, rules] of Object.entries(CATEGORY_KEYWORDS) as [Exclude<Category, "Others">, typeof CATEGORY_KEYWORDS["Air Con"]][]) {
    let s = 0;
    for (const r of rules) if (r.pattern.test(haystack)) s += r.weight;
    scores.set(cat, s);
  }
  // Toilet location rule: a toilet location turns Cleaning-type issues into Toilet.
  if (text.location && /toilet|washroom|restroom|lavatory|\bwc\b/i.test(text.location)) {
    const cleaning = scores.get("Cleaning") ?? 0;
    scores.set("Toilet", (scores.get("Toilet") ?? 0) + 2 + cleaning);
    scores.set("Cleaning", 0);
  }
  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const [top, second] = ranked;
  const score = top[1];
  const margin = score - (second?.[1] ?? 0);
  const highConfidence = score >= KEYWORD_CONFIDENCE.minScore && margin >= KEYWORD_CONFIDENCE.minMargin;
  return { category: score > 0 ? top[0] : null, score, margin, highConfidence };
}

/**
 * Hybrid rule: lock the category when the keyword result is high-confidence AND agrees with a
 * specific legacy sheet. Legacy "Others" and ambiguous records are classified freely by the LLM.
 */
export function lockedCategoryFor(r: {
  description: string;
  location?: string;
  assetOrEquipment?: string;
  legacyCategory: string;
}): Exclude<Category, "Others"> | null {
  const legacy = legacyToCategory(r.legacyCategory);
  if (!legacy) return null;
  const kw = keywordClassify({ description: r.description, location: r.location, asset: r.assetOrEquipment });
  return kw.highConfidence && kw.category === legacy ? legacy : null;
}
