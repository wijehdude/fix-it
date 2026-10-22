import type { Category } from "./categories";

/**
 * Keyword pre-classifier rules. Each pattern adds `weight` to its category.
 * The pre-classifier is only used to LOCK a category when it is confident and
 * agrees with a specific legacy sheet; everything else goes to the LLM.
 */
export const CATEGORY_KEYWORDS: Record<Exclude<Category, "Others">, { pattern: RegExp; weight: number }[]> = {
  "Air Con": [
    { pattern: /\b(air ?con|aircon|a\/c|acmv|fcu|ahu|chiller|thermostat|air[- ]?condition\w*)\b/i, weight: 3 },
    { pattern: /\b(too (cold|warm|hot)|not cold|very (cold|warm|hot)|stuffy|humid)\b/i, weight: 2 },
    { pattern: /\b(vent|diffuser|ventilation|exhaust fan|air flow|airflow)\b/i, weight: 1.5 },
  ],
  Lighting: [
    { pattern: /\b(light|lights|lighting|lamp|lamps|led|tube|bulb|downlight|luminaire)\b/i, weight: 3 },
    { pattern: /\b(flicker\w*|dim|dark|blink\w*)\b/i, weight: 1.5 },
    { pattern: /\b(exit sign|emergency light|light switch|timer)\b/i, weight: 2 },
  ],
  Cleaning: [
    { pattern: /\b(dirty|litter|rubbish|trash|garbage|bin|bins|spill\w*|stain\w*|dust\w*|mop|sweep|clean\w*)\b/i, weight: 2.5 },
    { pattern: /\b(pantry|vomit|food waste|sticky)\b/i, weight: 1 },
  ],
  Toilet: [
    { pattern: /\b(toilet|toilets|washroom|restroom|lavatory|wc|urinal|bidet|cubicle)\b/i, weight: 3 },
    { pattern: /\b(flush\w*|choked|soap dispenser|toilet paper|hand dryer|tissue|basin|sink)\b/i, weight: 2 },
  ],
  "Physical Security": [
    { pattern: /\b(cctv|camera|card reader|access card|door access|barrier|turnstile|intrusion|alarm|guard|security)\b/i, weight: 3 },
    { pattern: /\b(lock|locks|locked|unlock\w*|cannot lock|door closer|mag ?lock|latch)\b/i, weight: 2 },
  ],
};

/** Minimum winning score and margin over the runner-up for a "high-confidence" keyword result. */
export const KEYWORD_CONFIDENCE = { minScore: 3, minMargin: 2 };

/**
 * Legacy sheet / category names → new category. Sheet names are matched case-insensitively
 * after removing punctuation; partial matches are allowed (e.g. "Aircon Defects").
 * Anything unmatched (including "Others") is treated as non-specific.
 */
export const LEGACY_CATEGORY_ALIASES: { pattern: RegExp; category: Exclude<Category, "Others"> }[] = [
  { pattern: /air ?con|acmv|a\/c|hvac/i, category: "Air Con" },
  { pattern: /light/i, category: "Lighting" },
  { pattern: /clean|housekeep/i, category: "Cleaning" },
  { pattern: /toilet|washroom|restroom|sanitary/i, category: "Toilet" },
  { pattern: /security|access|cctv/i, category: "Physical Security" },
];
