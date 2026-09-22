import { z } from "zod";

import { perTranslatedLocale } from "../locales";

import facetLabelsJson from "./facet-labels.json" with { type: "json" };

/**
 * Curated facet labels for vocabulary no provider translates, in every locale the site serves.
 *
 * The catalogue sync fills `facet_media_translation` from what a provider publishes, and two
 * gaps fall outside that: Booking Manager translates only its equipment names, and not into
 * Ukrainian or Danish, so its regions and countries arrive with none; and `sail_type` has no
 * reference list behind it in either provider, so it reaches the search document as a bare
 * string.
 *
 * The equipment set below predates the sync reading Booking Manager's own equipment names, and
 * still covers Ukrainian and Danish. `equipmentFilterAllowlist` in seed.ts and the canonical
 * side of `AMENITY_GROUPS` are written in Booking Manager's vocabulary, so every value there
 * that NauSYS does not also publish reached a translated page in English - in the filter, and
 * on the cards, where the curated ranks put the same words. The sync never overwrites a row
 * written from here, so where both exist this set is what the page shows.
 *
 * Small on purpose. This is the exception list for what the sync cannot reach, not a second
 * catalogue — a value that a provider does translate belongs to the sync, which refreshes it
 * when the vendor renames it.
 *
 * Written as `source = 'generated'`, so a real vendor translation arriving later takes over and
 * the hand-written editorial copy in `seed.ts` is never touched.
 */
export const facetLabels = z
  .record(z.string(), z.record(z.string(), perTranslatedLocale(z.string())))
  .parse(facetLabelsJson);
