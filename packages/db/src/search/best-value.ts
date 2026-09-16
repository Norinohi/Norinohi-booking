import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";

import type * as schema from "../schema";
import { listingScope } from "./listing-scope";

/**
 * The cheapest quarter of each model, which is what the "Best value" badge now means.
 *
 * A separate statement rather than a column in the insert above: the comparison is against a
 * cohort, and the insert resolves one listing at a time. Reading the cohort back from the
 * documents just written is also what makes a partial rebuild sane -- the peers keep whatever
 * price the last run gave them, which is the catalogue as it currently stands.
 *
 * Only models carrying at least a handful of priced hulls are ranked. Below that a quartile is
 * an accident of how few boats a vendor happens to publish: with two listings the cheaper one
 * would be "best value" for being one of a pair, which is the empty claim this replaces.
 *
 * Compared in EUR, because half the catalogue is published in something else and a quartile over
 * mixed integers ranks a dollar against a euro. A listing no rate covers is left out rather than
 * ranked, and so is every model too small to have a distribution.
 *
 * A partial rebuild only re-marks the listings it touched. Their peers drift until the next full
 * pass, which is what the nightly sync does -- a badge is not worth a full-table pass on every
 * merge of a single boat.
 */
const BEST_VALUE_MIN_PEERS = 5;
const BEST_VALUE_QUANTILE = 0.25;

/*
 * Left on the all-in figure whatever the cards are set to show.
 *
 * "Best value" is a claim about what a guest pays, not about how a rate reads beside other
 * sites -- and it is written at rebuild time, so following the display switch would be the one
 * thing that made flipping it cost a reprojection of the fleet.
 */
export async function markBestValue(
  db: NodePgDatabase<typeof schema>,
  listingIds: readonly string[] | undefined,
) {
  await db.execute(sql`
    with peers as (
      select
        model,
        percentile_cont(${BEST_VALUE_QUANTILE}) within group (order by price_from_minor_eur) as cutoff
      from listing_search_doc
      where model is not null and price_from_minor_eur is not null
      group by model
      having count(*) >= ${BEST_VALUE_MIN_PEERS}
    ),
    /* Left joined, so a listing whose model fell below the peer floor or whose price went away
       resolves to false and gives the badge back rather than keeping a stale one. */
    desired as (
      select
        doc.listing_id,
        coalesce(
          doc.price_from_minor_eur is not null and doc.price_from_minor_eur <= peers.cutoff,
          false
        ) as flag
      from listing_search_doc doc
      left join peers on peers.model = doc.model
      where ${listingScope(sql`doc.listing_id`, listingIds)}
    )
    update listing_search_doc doc
    set best_value = desired.flag
    from desired
    where desired.listing_id = doc.listing_id
      and doc.best_value is distinct from desired.flag
  `);
}
