import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";

import type * as schema from "../schema";

/**
 * What the projection currently holds, for an operator who has just rebuilt it by hand.
 *
 * A rebuild that writes the right number of rows but prices none of them has failed in a
 * way a row count alone cannot show, and the entry point that runs it lives in `apps/server`,
 * which deliberately does not depend on drizzle-orm. So the query belongs here.
 */
export async function readListingSearchDocStats(db: NodePgDatabase<typeof schema>): Promise<{
  docs: number;
  priced: number;
  basePriced: number;
  /* Rows breaking the invariant that a charter rate cannot exceed the all-in total it is part
     of. Reported rather than assumed: the two are assembled by different laterals, and a vendor
     answering its fees in another currency is exactly the case that would separate them. */
  baseAboveAllIn: number;
  bookable: number;
}> {
  const { rows } = await db.execute<{
    docs: number;
    priced: number;
    basePriced: number;
    baseAboveAllIn: number;
    bookable: number;
  }>(sql`
    select
      count(*)::int as docs,
      count(price_from_minor)::int as priced,
      count(base_price_from_minor)::int as "basePriced",
      count(*) filter (where base_price_from_minor > price_from_minor)::int as "baseAboveAllIn",
      count(bookable_from)::int as bookable
    from listing_search_doc
  `);

  return rows[0] ?? { docs: 0, priced: 0, basePriced: 0, baseAboveAllIn: 0, bookable: 0 };
}
