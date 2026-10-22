export const CATEGORIES = [
  "Air Con",
  "Lighting",
  "Cleaning",
  "Toilet",
  "Physical Security",
  "Others",
] as const;

export type Category = (typeof CATEGORIES)[number];

/** Category definitions — used in the classification system prompt and the UI. */
export const CATEGORY_DEFINITIONS: Record<Category, string> = {
  "Air Con":
    "ACMV, aircon not cold or too cold, FCU/AHU, water dripping from an aircon unit, noise, smell from vents, thermostat.",
  Lighting:
    "Lamps, LED panels, flickering, dark areas, emergency or exit lights, light switches, timers.",
  Cleaning:
    "Dirty floors, spills, litter, rubbish bins, stains, odours (not toilet-specific), pantry cleanliness.",
  Toilet:
    "Anything located in or about toilets/washrooms: choked WC or urinal, flushing, taps, soap or paper dispensers, toilet cleanliness, toilet odour. Rule: a toilet location takes precedence over Cleaning.",
  "Physical Security":
    "Door access, card readers, locks, CCTV, barriers, intrusion alarms, broken locks/doors that affect security, guard post issues.",
  Others:
    "None of the above (e.g. lifts, plumbing outside toilets, pest, ceiling or wall damage, furniture, signage, IT/network). These records MUST get an othersSubTheme.",
};

/** Suggested sub-themes for records that remain in Others. The AI may propose others. */
export const OTHERS_SUB_THEMES = [
  "Lift",
  "Plumbing",
  "Pest Control",
  "Building Fabric",
  "Furniture",
  "Signage",
  "IT/Network",
  "Fire Protection",
  "Electrical Power",
  "Landscaping",
  "General",
] as const;

/** Colour per category (CSS variables defined in globals.css). */
export const CATEGORY_COLOR_VAR: Record<Category, string> = {
  "Air Con": "var(--cat-aircon)",
  Lighting: "var(--cat-lighting)",
  Cleaning: "var(--cat-cleaning)",
  Toilet: "var(--cat-toilet)",
  "Physical Security": "var(--cat-security)",
  Others: "var(--cat-others)",
};

export const OPERATIONAL_IMPACTS = [
  "Safety",
  "Security",
  "Service Disruption",
  "Hygiene",
  "Comfort",
  "Cosmetic",
] as const;
export type OperationalImpact = (typeof OPERATIONAL_IMPACTS)[number];

export const SEVERITY_RUBRIC: Record<1 | 2 | 3 | 4 | 5, string> = {
  5: "Safety or security risk to people or assets (e.g. access door cannot lock, exposed wiring, water near electrical)",
  4: "Major service disruption to an area or many occupants (e.g. whole floor without aircon or lights)",
  3: "Localised disruption to a function (one room too warm, one toilet choked)",
  2: "Minor inconvenience or comfort issue",
  1: "Cosmetic, or a request rather than a fault",
};

/** Records below this classification confidence are flagged for human review. */
export const LOW_CONFIDENCE_THRESHOLD = 0.6;
