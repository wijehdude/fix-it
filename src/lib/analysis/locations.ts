import { LOCATION_ABBREVIATIONS, type Criticality } from "@/config/locations";
import type { LocationRating } from "@/lib/types";

/** Trims, case-folds and expands common abbreviations ("L3" → "level 3", "Lvl" → "level"). */
export function normaliseLocation(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  let s = String(raw).toLowerCase().replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
  if (!s) return undefined;
  for (const [re, rep] of LOCATION_ABBREVIATIONS) s = s.replace(re, rep);
  s = s
    .replace(/\s*[,;|]\s*/g, ", ")
    .replace(/\s*-\s*/g, " - ")
    .replace(/\s+/g, " ")
    .replace(/^[\s,-]+|[\s,-]+$/g, "")
    .trim();
  return s || undefined;
}

/** Title-cases a normalised location for display. */
export function displayLocation(norm: string | undefined): string {
  if (!norm) return "Unspecified";
  return norm.replace(/\b([a-z])/g, (c) => c.toUpperCase());
}

export function effectiveCriticality(r: LocationRating | undefined): Criticality | "Unknown" {
  return r?.override ?? r?.ai ?? "Unknown";
}
