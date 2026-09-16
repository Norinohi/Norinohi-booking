import { z } from "zod";

import ukJson from "./uk.json" with { type: "json" };

const labelsByGroup = z.record(z.string(), z.record(z.string(), z.string()));

/**
 * Generated Ukrainian labels for the catalogue's provider-sourced vocabulary.
 *
 * Ukrainian is the locale no provider supplies. NauSYS names every reference list in eighteen
 * languages and none of them is it, so where German and Spanish are sourced and refreshed on
 * each sync, these are produced once and reviewed in `uk.json`. Booking Manager ships no
 * translations at all, in any locale, which is why nothing of its own appears there.
 *
 * `apply-translations.ts` writes these as `source = 'generated'`, which is what keeps them out
 * of the way of both the sync and the hand-written editorial copy in `seed.ts`.
 *
 * Keys are the English label exactly as `facet_media.value` holds it, because that is what the
 * read join matches on. A value that stays Latin — AIS, GPS, Starlink, a brand name — is
 * deliberately listed as itself rather than omitted, so a later pass can tell "checked, stays
 * as it is" from "not looked at yet".
 */

/** Extras are keyed `<kind>:<externalId>`, the provider's own id space. */
export const ukTranslations = z
  .object({ facets: labelsByGroup, extras: labelsByGroup })
  .parse(ukJson);
