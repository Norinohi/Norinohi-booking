import { env } from "@yacht-charter/env/web";
import { z } from "zod";

/**
 * Forward geocoding, for the one screen that types a place name and needs its coordinates.
 *
 * Called straight from the browser rather than proxied through the API: the token is the public
 * `pk.` one the maps already carry, and a proxy would only add a hop. The response is parsed
 * rather than trusted — this is a third-party payload, and a stop whose coordinates came back as
 * strings would be written to two `double precision` columns as NaN.
 */
const FORWARD = "https://api.mapbox.com/search/geocode/v6/forward";

const responseSchema = z.object({
  features: z.array(
    z.object({
      id: z.string(),
      properties: z.object({
        name: z.string(),
        place_formatted: z.string().optional(),
        full_address: z.string().optional(),
        coordinates: z.object({ longitude: z.number(), latitude: z.number() }),
      }),
    }),
  ),
});

export type GeocodeResult = {
  id: string;
  name: string;
  /** "Vis, Split-Dalmatia, Croatia" where Mapbox gave one; the bare name otherwise. */
  context: string;
  lat: number;
  lng: number;
};

export async function geocodePlaces(
  query: string,
  options: { signal?: AbortSignal; proximity?: { lat: number; lng: number }; limit?: number } = {},
): Promise<GeocodeResult[]> {
  const url = new URL(FORWARD);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", String(options.limit ?? 6));
  url.searchParams.set("access_token", env.NEXT_PUBLIC_MAPBOX_TOKEN);
  /* Biases the ranking towards the base the route starts from, so "Vis" resolves to the Adriatic
     island rather than to whichever other Vis has more people on it. */
  if (options.proximity) {
    url.searchParams.set("proximity", `${options.proximity.lng},${options.proximity.lat}`);
  }

  const response = await fetch(url, { signal: options.signal });
  if (!response.ok) return [];

  const parsed = responseSchema.safeParse(await response.json());
  if (!parsed.success) return [];

  return parsed.data.features.map((feature) => ({
    id: feature.id,
    name: feature.properties.name,
    context:
      feature.properties.full_address ??
      feature.properties.place_formatted ??
      feature.properties.name,
    lat: feature.properties.coordinates.latitude,
    lng: feature.properties.coordinates.longitude,
  }));
}
