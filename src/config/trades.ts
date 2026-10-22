import type { Category } from "./categories";

/** Default man-hours per job for each trade (placeholders until calibrated with the maintenance team). */
export const TRADE_DEFAULT_HOURS: Record<string, number> = {
  "ACMV Technician": 1.5,
  Electrician: 0.75,
  Cleaner: 0.5,
  Plumber: 1.0,
  "Security Systems Technician": 1.0,
  "General Handyman": 1.0,
  "Lift Contractor": 1.5,
  "Pest Control": 1.0,
  "IT Support": 1.0,
};

export const CATEGORY_TRADE: Record<Exclude<Category, "Toilet" | "Others">, string> = {
  "Air Con": "ACMV Technician",
  Lighting: "Electrician",
  Cleaning: "Cleaner",
  "Physical Security": "Security Systems Technician",
};

/** Toilet records go to a Cleaner when they are about cleanliness or consumables, otherwise a Plumber. */
export const TOILET_CLEANER_PATTERN =
  /clean|dirty|stain|odou?r|smell|litter|wet floor|refill|soap|paper|tissue|dispenser|sanitis|hygiene|consumable|\bbin\b/i;
export const TOILET_TRADES = { fixture: "Plumber", cleanliness: "Cleaner" };

/** Others sub-theme → trade. Unmapped sub-themes go to the General Handyman. */
export const OTHERS_SUBTHEME_TRADE: Record<string, string> = {
  Lift: "Lift Contractor",
  Plumbing: "Plumber",
  "Pest Control": "Pest Control",
  "IT/Network": "IT Support",
  "Electrical Power": "Electrician",
};
export const DEFAULT_OTHERS_TRADE = "General Handyman";
