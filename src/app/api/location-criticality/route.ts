import { callStructured } from "@/lib/ai/client";
import { LOCATION_SYSTEM } from "@/lib/ai/prompts";
import { locationJsonSchema, locationValidator } from "@/lib/ai/schemas";
import { LocationRequest, type LocationResponse } from "@/lib/api/contracts";
import { scrubPII } from "@/lib/pii";
import { mockEnabled, mockLocations } from "@/lib/ai/mock";
import { handlePost } from "@/lib/server/http";

export const maxDuration = 60;

export async function POST(req: Request) {
  return handlePost(req, "location-criticality", LocationRequest, async ({ locations }): Promise<LocationResponse> => {
    if (mockEnabled()) return { ratings: mockLocations(locations) };
    const scrubbed = locations.map((l) => scrubPII(l));
    const out = await callStructured({
      name: "location_criticality",
      system: LOCATION_SYSTEM,
      user: `Rate these ${scrubbed.length} locations:\n${JSON.stringify(scrubbed)}`,
      jsonSchema: locationJsonSchema,
      validator: locationValidator,
    });
    // Map back to the caller's original strings by position-insensitive lookup.
    const byScrubbed = new Map(out.ratings.map((r) => [r.location.trim().toLowerCase(), r]));
    const ratings: LocationResponse["ratings"] = [];
    locations.forEach((loc, i) => {
      const r = byScrubbed.get(scrubbed[i].trim().toLowerCase());
      if (r) ratings.push({ location: loc, criticality: r.criticality, reason: r.reason.slice(0, 160) });
    });
    return { ratings };
  });
}
