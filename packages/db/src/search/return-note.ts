import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type * as schema from "../schema";

/**
 * The operator's rule for bringing the boat back, in `locale`, else in English, else the note the
 * selling operator states for its whole fleet. Unlike the description this is an instruction the
 * charter depends on, so English beats saying nothing.
 *
 * NauSYS writes the rule per base into the offer's `return_note` text. Booking Manager states it
 * once per company (`checkoutNote`), so it is read off the operator of the offer being sold, and
 * off the listing's operator where no offer is named. Where an offer is named, another offer's
 * text is ignored: on a listing two fleets sell, that is a different operator's rule.
 */
export async function readReturnNote(
  db: NodePgDatabase<typeof schema>,
  input: { listingId: string; listingOfferId: string | null; locale: string },
): Promise<string | undefined> {
  const { listingId, listingOfferId, locale } = input;
  const rows = await db.execute<{ value: string }>(sql`
    select value from (
      select value, case when locale = ${locale} then 0 else 1 end as rank
      from listing_text
      where listing_id = ${listingId} and kind = 'return_note' and locale in (${locale}, 'en')
        and (${listingOfferId}::text is null or listing_offer_id = ${listingOfferId}::text)
      union all
      select op.checkout_note, 2
      from listing l
      left join listing_offer o on o.id = ${listingOfferId}::text and o.listing_id = l.id
      join operator op on op.id = coalesce(o.operator_id, l.operator_id)
      where l.id = ${listingId} and nullif(btrim(op.checkout_note), '') is not null
    ) note
    order by rank
    limit 1
  `);

  return rows.rows[0]?.value;
}
