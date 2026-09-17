import { PROVIDER_KEYS, type ProviderKey, providerMeta } from "@yacht-charter/env/providers";
import { sql, type SQL } from "drizzle-orm";

/**
 * The earliest check-in a projected charter may start on, in whole days from today.
 *
 * The projection and the presenter have to apply the same floor. `bookablePeriodOf` re-tests
 * the period this projection stored, because a doc is only as fresh as its last run and a day
 * passes underneath it; when the two floors disagreed, the projection kept selecting charters
 * the presenter would then reject. It had no second candidate to offer, so the listing lost its
 * bookable period entirely and advertised itself on request while holding priced weeks later in
 * the season -- Lagoon 52 my-one-lagoon-52-f-5-cab-28481585 held one confirmed night starting
 * today and three confirmed December weeks behind it, and showed none of them.
 *
 * Applying it here is what makes the fallback work: the candidate list is ordered by check-in,
 * so excluding the ones that are too close advances to the next sellable charter, priced by the
 * laterals below against that period rather than against a charter nobody can buy.
 *
 * One day, because a charter checking in this afternoon is not on sale: the booking has to reach
 * the operator and come back confirmed, and the base has to hand the boat over. It is the floor
 * every provider shares; `providerLeadDaysSql` raises it where a vendor needs longer.
 */
export const MIN_LEAD_DAYS = 1;

/*
 * The notice a vendor needs, where it is longer than the shared floor. `leadDays` in the provider
 * registry holds each figure and the measurement behind it.
 */
export const PROVIDER_LEAD_DAYS: Readonly<Partial<Record<ProviderKey, number>>> =
  Object.fromEntries(
    PROVIDER_KEYS.flatMap((key) => {
      const days = providerMeta(key).leadDays;
      return days === null ? [] : [[key, days]];
    }),
  );

/** The lead time for the provider whose code `code` evaluates to, as an integer expression. */
export function providerLeadDaysSql(code: SQL): SQL {
  const cases = Object.entries(PROVIDER_LEAD_DAYS).map(
    ([provider, days]) => sql`when ${provider} then ${days}::int`,
  );
  return sql`(case ${code} ${sql.join(cases, sql` `)} else ${MIN_LEAD_DAYS}::int end)`;
}

/** The earliest day a charter may check in on, as SQL, so every candidate branch shares it. */
/* Read where provider `p` is in scope, which it is everywhere a charter is chosen. */
export const EARLIEST_CHECKIN = sql`(current_date + ${providerLeadDaysSql(sql`p.code`)})`;
