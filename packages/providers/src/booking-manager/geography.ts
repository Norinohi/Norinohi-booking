import { distanceKm, type GeoPoint } from "@yacht-charter/db/geo/distance";
import type { ReferenceRegion } from "@yacht-charter/db/geo/reference-regions";
import { foldedLetters } from "@yacht-charter/db/search/normalize";
import { z } from "zod";

import aliasesJson from "./sailing-area-aliases.json" with { type: "json" };

/**
 * Names the vendor and our regions spell differently for one place, per country. `place` is a
 * sailing area as the vendor writes it, whole or one side of a "Istria / Kvarner" pair.
 */
const SAILING_AREA_ALIASES = z
  .array(z.object({ country: z.string(), place: z.string(), region: z.string() }))
  .parse(aliasesJson);

/*
 * How much farther than the nearest region a named one may be and still win. The vendor files
 * the odd base under a sailing area across the country: "Symi Marina" under "Athens / Saronic
 * Gulf", 356 km from the nearest Saronic base and 39 from a Dodecanese one, and "Zaton Port" by
 * Dubrovnik under "Kornati". A name that far off is a slip rather than a statement.
 */
const NAME_MATCH_SLACK_KM = 100;

/*
 * Past this, the nearest region is somewhere else rather than nearby: Lisbon's nearest region
 * with boats from the other vendor is the Azores.
 */
const NEAREST_REGION_MAX_KM = 150;

/* Words our region names add to a place the vendor names bare: "Split region", "Ionian Islands". */
const GENERIC_WORDS = new Set(["region", "area", "islands", "island", "gulf", "sea", "coast"]);

/** The comparable parts of a place name: "Athens area/Saronic/Peloponese" is three places. */
export function placeKeys(name: string): string[] {
  return name
    .split(/[/,&()-]/)
    .map((part) =>
      foldedLetters(part)
        .split(/[^a-z0-9]+/)
        .filter((word) => word.length > 0 && !GENERIC_WORDS.has(word))
        .join(" "),
    )
    .filter((key) => key.length > 0);
}

export type BaseToPlace = {
  countryCode: string;
  /** The vendor's sailing area names for the base, in the vendor's order. */
  sailingAreas: readonly string[];
  point: GeoPoint | undefined;
};

/**
 * The region of ours a Booking Manager base belongs in, or undefined when none fits.
 *
 * The vendor's sailing areas are coarser than our regions and cross borders, so a base is placed
 * into a region the other vendor's boats already sail from, in the same country: first one its
 * sailing area names, then the nearest by coordinates. Where a sailing area names two of ours
 * ("Istria / Kvarner") the nearer one wins. Failing both, an alias still names our spelling of
 * the place ("Bretagne" is "Brittany") even where no other vendor sails from it yet.
 */
export function regionFor(
  base: BaseToPlace,
  regions: readonly ReferenceRegion[],
): string | undefined {
  return referenceRegionFor(base, regions) ?? aliasesFor(base)[0]?.region;
}

function aliasesFor(base: BaseToPlace) {
  return SAILING_AREA_ALIASES.filter((alias) => {
    if (alias.country !== base.countryCode) return false;
    const aliasKeys = placeKeys(alias.place);
    return (
      aliasKeys.length > 0 &&
      base.sailingAreas.some((sailingArea) => {
        const keys = placeKeys(sailingArea);
        return aliasKeys.every((key) => keys.includes(key));
      })
    );
  });
}

function referenceRegionFor(
  base: BaseToPlace,
  regions: readonly ReferenceRegion[],
): string | undefined {
  const inCountry = regions.filter((region) => region.countryCode === base.countryCode);
  if (inCountry.length === 0) return undefined;

  const named = namedRegions(base, inCountry);
  const point = base.point;
  if (point === undefined) return named[0]?.name;

  const measured = inCountry
    .map((region) => ({ region, km: nearestKm(region, point) }))
    .filter((item): item is { region: ReferenceRegion; km: number } => item.km !== undefined)
    .sort((a, b) => a.km - b.km);
  const nearest = measured[0];

  if (named.length > 0) {
    const nearestNamed = measured.find((item) => named.includes(item.region));
    if (nearestNamed === undefined) return named[0]?.name;
    if (nearest === undefined || nearestNamed.km - nearest.km <= NAME_MATCH_SLACK_KM) {
      return nearestNamed.region.name;
    }
  }

  return nearest !== undefined && nearest.km <= NEAREST_REGION_MAX_KM
    ? nearest.region.name
    : undefined;
}

function namedRegions(base: BaseToPlace, regions: readonly ReferenceRegion[]): ReferenceRegion[] {
  const found: ReferenceRegion[] = [];
  const add = (region: ReferenceRegion | undefined) => {
    if (region !== undefined && !found.includes(region)) found.push(region);
  };

  for (const alias of aliasesFor(base)) {
    add(regions.find((region) => region.name === alias.region));
  }
  for (const sailingArea of base.sailingAreas) {
    for (const key of placeKeys(sailingArea)) {
      for (const region of regions) {
        if (placeKeys(region.name).includes(key)) add(region);
      }
    }
  }
  return found;
}

function nearestKm(region: ReferenceRegion, point: GeoPoint): number | undefined {
  let best: number | undefined;
  for (const other of region.points) {
    const km = distanceKm(point, other);
    if (best === undefined || km < best) best = km;
  }
  return best;
}
