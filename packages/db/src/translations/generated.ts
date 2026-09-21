import { z } from "zod";

import daJson from "./da.json" with { type: "json" };
import ukJson from "./uk.json" with { type: "json" };

const labelsByGroup = z.record(z.string(), z.record(z.string(), z.string()));

/**
 * Generated labels for the catalogue's provider-sourced vocabulary, per locale that has none.
 *
 * NauSYS names every reference list in eighteen languages, and two the site serves are not
 * among them: Ukrainian and Danish. Where German, Spanish and the rest are sourced and
 * refreshed on each sync, these are produced once and reviewed in their own file. Booking
 * Manager translates its equipment names into eight of the site's languages but neither of
 * these two (its Ukrainian answers in English), which is why nothing of its own appears here.
 *
 * `apply-translations.ts` writes these as `source = 'generated'`, which is what keeps them out
 * of the way of both the sync and the hand-written editorial copy in `seed.ts`.
 *
 * Keys are the English label exactly as `facet_media.value` holds it, because that is what the
 * read join matches on. A value that stays Latin — AIS, GPS, Starlink, a brand name — is
 * deliberately listed as itself rather than omitted, so a later pass can tell "checked, stays
 * as it is" from "not looked at yet".
 *
 * Extras are keyed `<kind>:<externalId>`, the provider's own id space, and only the Ukrainian
 * set names any: the pass that produced them has not been repeated for another locale.
 */
const generatedSchema = z.object({ facets: labelsByGroup, extras: labelsByGroup });

export const generatedTranslations = z
  .record(z.string().min(2), generatedSchema)
  .parse({ uk: ukJson, da: daJson });
