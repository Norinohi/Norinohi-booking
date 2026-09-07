import { sql, type SQL } from "drizzle-orm";

import type { Database } from "../registry";
import { resolveCanonicalListings } from "./canonical-listing-writer";

/**
 * Two facts neither vendor publishes as a field, recovered from the fees they publish instead.
 *
 * `listing_offer.pets_allowed` and `listing_offer.deposit_insurance_included` have existed since
 * the offer table did, and nothing has ever written either of them: the canonical DTO carries no
 * such field, so every row held the column default and the two badges that read them were dead
 * code on all 18,655 listings.
 *
 * The information is in `provider_extra_catalogue`. An operator that takes a dog charges for it
 * ("Pet on board", "Pet fee (per pet)"), and one that insures the deposit sells the cover
 * ("Deposit insurance", "Damage waiver"). So the flags are derived from the fee list rather than
 * asked for, which is the only way to have them at all.
 *
 * Run after the extras are written and before the documents are rebuilt. The catalogue writer
 * overwrites both columns from the DTO on every sync, so this has to run each time rather than
 * once as a backfill.
 */

/**
 * Word-bounded on purpose: `pet` matches "petrol" and "carpet" otherwise, and NauSYS files
 * "Extra Additional fuel tank, portable for 5L gasoline/petrol" on thousands of offers.
 */
export const PETS_PATTERN = String.raw`(^|[^a-z])(pet|pets|dog|dogs|animal|animals)([^a-z]|$)`;

/**
 * A fee that hedges on whether the boat takes animals at all is not permission.
 *
 * "Cleaning for pets (if allowed)" is priced by operators who have not decided, and it was the
 * only pet row on 125 listings -- each of which would have advertised "Pets allowed" on the
 * strength of a conditional. Anything worded "on request" stays: the operator entertains the ask,
 * which is what the badge promises.
 */
export const PETS_HEDGE_PATTERN = String.raw`if allowed`;

/** How the two vendors name the cover, including the tiered variants Booking Manager sells. */
export const DEPOSIT_INSURANCE_PATTERN = String.raw`deposit.*insur|insur.*deposit|waiver|damage.*insur`;

/**
 * The flags, and the canonical listings composed from them.
 *
 * `pets_allowed` reaches the card through `listing`, not through the offer, so deriving the
 * offer flag alone leaves the badge off until something else happens to recompose the listing.
 * Callers that have just written extras pass the listings they touched; the deploy-time rebuild
 * passes nothing and gets the published fleet.
 */
export async function refreshOfferFlags(db: Database, listingIds?: readonly string[]) {
  await deriveOfferFlagsFromExtras(db, listingIds);

  const scope =
    listingIds ??
    (
      await db.execute<{ id: string }>(sql`select id from listing where status = 'published'`)
    ).rows.map((row) => row.id);

  await resolveCanonicalListings(db, scope);
}

export async function deriveOfferFlagsFromExtras(db: Database, listingIds?: readonly string[]) {
  /*
   * One bound `text[]`, not a list of ids. Drizzle expands an array in a template into a
   * parameter each, which `any(...)` reads as a row expression and rejects outright -- so this
   * branch failed for any scope at all, and at fleet scale failed as "ROW expressions can have
   * at most 1664 entries", taking the projection phase of every full sync down with it.
   */
  const scope = listingIds
    ? sql`o.listing_id = any(${sql.param([...new Set(listingIds)])}::text[])`
    : sql`true`;

  await updateOfferFlags(db, scope);
}

async function updateOfferFlags(db: Database, scope: SQL) {
  await db.execute(sql`
    update listing_offer o
    set
      pets_allowed = exists (
        select 1
        from provider_extra_catalogue e
        where e.listing_offer_id = o.id
          and e.name ~* ${PETS_PATTERN}
          and e.name !~* ${PETS_HEDGE_PATTERN}
      ),
      /*
       * "Included" is a claim about the price, not about availability: a waiver the customer can
       * buy is an option, and calling that included would sell a discount nobody granted. So only
       * a cover the charter cannot decline, or one that costs nothing, counts.
       */
      deposit_insurance_included = exists (
        select 1
        from provider_extra_catalogue e
        where e.listing_offer_id = o.id
          and e.name ~* ${DEPOSIT_INSURANCE_PATTERN}
          and (e.obligatory or e.price_minor = 0)
      )
    where ${scope}
      and (
        o.pets_allowed is distinct from exists (
          select 1
          from provider_extra_catalogue e
          where e.listing_offer_id = o.id
            and e.name ~* ${PETS_PATTERN}
            and e.name !~* ${PETS_HEDGE_PATTERN}
        )
        or o.deposit_insurance_included is distinct from exists (
          select 1
          from provider_extra_catalogue e
          where e.listing_offer_id = o.id
            and e.name ~* ${DEPOSIT_INSURANCE_PATTERN}
            and (e.obligatory or e.price_minor = 0)
        )
      )
  `);
}
