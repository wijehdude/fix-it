export type Criticality = "High" | "Medium" | "Low";
export const CRITICALITY_LEVELS: Criticality[] = ["High", "Medium", "Low"];

/** Guidance for the location-criticality prompt. */
export const CRITICALITY_GUIDANCE: Record<Criticality, string> = {
  High: "server/data/comms rooms, control rooms, main lobby, security posts, main entrances, electrical/plant rooms, lifts, fire exits",
  Medium: "offices, meeting rooms, pantries, toilets, corridors",
  Low: "storerooms, back-of-house, car park (non-security issues), external landscaping",
};

/** Abbreviation expansions applied when normalising locations (whole-word, case-insensitive). */
export const LOCATION_ABBREVIATIONS: [RegExp, string][] = [
  [/\blvl\.?\s*(\d+)/gi, "level $1"],
  [/\blv\.?\s*(\d+)/gi, "level $1"],
  [/\bl(\d+)\b/gi, "level $1"],
  [/\b(\d+)(st|nd|rd|th)\s+(floor|storey|level)\b/gi, "level $1"],
  [/\bfloor\s*(\d+)/gi, "level $1"],
  [/\bb(\d+)\b/gi, "basement $1"],
  [/\bblk\.?\b/gi, "block"],
  [/\brm\.?\b/gi, "room"],
  [/\bmtg\b/gi, "meeting"],
  [/\bcp\b/gi, "car park"],
  [/\bm\/f\b/gi, "male"],
  [/\bf\/f\b/gi, "female"],
  [/\bgf\b/gi, "ground floor"],
];
