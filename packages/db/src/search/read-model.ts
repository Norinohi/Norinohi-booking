import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq, sql, type SQL } from "drizzle-orm";

import type * as schema from "../schema";
import { listing } from "../schema/listing";

/**
 * Booking Manager photographs better than NauSYS, so its rows front a listing
 * that carries both (architecture §3). Mirrors `pickPrimaryImage` in
 * packages/api/src/services/match.ts; the two must agree or the search card and
 * the duplicate-review screen show different boats.
 */
const MEDIA_SOURCE_RANK = sql`case lm.source when 'booking_manager' then 0 when 'nausys' then 1 else 2 end`;

const MEDIA_ROLE_RANK = sql`case lm.role when 'main' then 0 when 'gallery' then 1 else 2 end`;

export type RebuildListingSearchDocsOptions = {
  listingIds?: readonly string[];
};

export async function rebuildListingSearchDocs(
  db: NodePgDatabase<typeof schema>,
  options: RebuildListingSearchDocsOptions = {},
) {
  const listingIds = options.listingIds ? uniqueIds(options.listingIds) : undefined;
  if (options.listingIds && listingIds?.length === 0) return;

  await db.execute(sql`
    insert into listing_search_doc (
      listing_id,
      slug,
      title,
      category,
      crew_type,
      builder,
      model,
      model_canonical,
      operator,
      base_id,
      base_name,
      city,
      location,
      region,
      country,
      lat,
      lng,
      base_email,
      base_phone,
      base_website,
      base_check_in_time,
      base_check_out_time,
      length_m,
      cabins,
      berths,
      heads,
      showers,
      year_built,
      sail_type,
      security_deposit_minor,
      security_deposit_currency,
      deposit_insurance_included,
      pets_allowed,
      rating,
      review_count,
      main_image,
      gallery,
      amenities,
      price_from_minor,
      currency,
      available_from,
      available_to,
      bookable_from,
      bookable_to,
      has_unconfirmed_availability,
      has_temporary_booking,
      searchable_text,
      created_at,
      updated_at
    )
    select
      l.id,
      l.slug,
      l.title,
      -- The marketplace category, not the vendor's: facets group on this column, and
      -- ungrouped vendor near-synonyms would each become their own facet. An
      -- unclassified category falls back to its own name rather than dropping out.
      coalesce(cat.canonical_name, cat.name),
      l.crew_type,
      -- The brand, not the legal entity: providers send "Bavaria Yachtbau" and "Lagoon-Bénéteau",
      -- and grouped by those the same brand splits into several shipyard pages and filters.
      coalesce(bld.canonical_name, bld.name),
      mdl.name,
      -- The grouping name, like the category above: a model with no cabin suffix to strip has no
      -- canonical of its own, and writing that null left every model page without a value to
      -- group on.
      coalesce(mdl.canonical_name, mdl.name),
      op.name,
      bs.id,
      bs.name,
      loc.city,
      loc.name,
      rgn.name,
      cty.name,
      bs.lat,
      bs.lng,
      bs.email,
      bs.phone,
      bs.website,
      bs.check_in_time,
      bs.check_out_time,
      spec.length_m,
      spec.cabins,
      spec.berths,
      spec.heads,
      spec.showers,
      spec.year_built,
      spec.sail_type,
      -- Only ever shown as "plus a refundable deposit"; a zero is the provider
      -- saying it takes none, so it is stored as null and the card omits the line.
      nullif(l.security_deposit_minor, 0),
      case when l.security_deposit_minor > 0 then l.security_deposit_currency end,
      l.deposit_insurance_included,
      l.pets_allowed,
      -- Our own reviews win outright; the provider aggregate only fills the gap
      -- for a listing nobody has reviewed here. The two are never averaged: they
      -- count different populations of guests.
      coalesce(
        case when rev.review_count > 0 then rev.rating end,
        l.provider_rating,
        0
      )::numeric(3, 2),
      coalesce(nullif(rev.review_count, 0), l.provider_review_count, 0)::integer,
      media.main_image,
      coalesce(media.gallery, '[]'::jsonb),
      coalesce(amn.amenities, '[]'::jsonb),
      /*
       * The all-in weekly price, because that is what the customer is asked to pay and what the
       * detail page totals. The rate alone advertised EUR 809 beside a booking summary charging
       * EUR 959: the difference is a cleaning fee nobody can decline, on every Shannon hull.
       *
       * Only fees that apply whatever the customer chooses. A one-way fee is charged on a route
       * they have to pick, and folding it in would inflate every card for a charter almost none
       * of them will book.
       */
      case
        when coalesce(week.price_minor, rate.price_from_minor) is null then null
        else coalesce(week.price_minor, rate.price_from_minor)
             + coalesce(week.obligatory_extras_minor, fees.unavoidable_minor, 0)
      end,
      coalesce(rate.currency, l.default_currency),
      avail.available_from,
      avail.available_to,
      checkin.bookable_from,
      checkin.bookable_to,
      coalesce(avail.has_unconfirmed_availability, false),
      coalesce(held.has_temporary_booking, false),
      concat_ws(
        ' ',
        l.title,
        -- Both spellings: a guest searching the vendor's wording ("motor boat")
        -- and one searching the group ("motor yacht") must both hit this listing.
        cat.name,
        cat.canonical_name,
        l.crew_type,
        bld.name,
        bld.canonical_name,
        mdl.name,
        op.name,
        bs.name,
        loc.name,
        rgn.name,
        cty.name,
        spec.sail_type,
        amn.amenity_text,
        txt.description
      ),
      now(),
      now()
    from listing l
    join operator op on op.id = l.operator_id
    join base bs on bs.id = l.home_base_id
    join location loc on loc.id = bs.location_id
    join region rgn on rgn.id = loc.region_id
    join country cty on cty.id = rgn.country_id
    left join yacht_category cat on cat.id = l.category_id
    left join builder bld on bld.id = l.builder_id
    left join yacht_model mdl on mdl.id = l.model_id
    left join listing_specification spec on spec.listing_id = l.id
    /*
     * Media precedence, not alphabetical order. A merged listing carries rows from
     * every provider linked to it, and architecture section 3 prefers Booking
     * Manager's photos over NauSYS's. The previous min(external_url) picked
     * whichever URL sorted first, which is arbitrary and would have let the losing
     * provider's image front a merged card.
     *
     * Identical output for a single-source listing with one main row, which is
     * every listing until a merge happens.
     */
    left join lateral (
      select
        (
          select lm.external_url
          from listing_media lm
          where lm.listing_id = l.id
          order by ${MEDIA_SOURCE_RANK}, ${MEDIA_ROLE_RANK}, lm.sort_order
          limit 1
        ) as main_image,
        (
          select jsonb_agg(lm.external_url order by ${MEDIA_SOURCE_RANK}, lm.sort_order)
          from listing_media lm
          where lm.listing_id = l.id
        ) as gallery
    ) media on true
    left join lateral (
      select
        jsonb_agg(a.name order by a.name) filter (
          where la.obligatory = false and la.price_minor is null
        ) as amenities,
        string_agg(a.name, ' ') as amenity_text
      from listing_amenity la
      join amenity a on a.id = la.amenity_id
      where la.listing_id = l.id
    ) amn on true
    /*
     * The cheapest week this listing could actually sell.
     *
     * Read from the rate list rather than from unsold slots, because that made the headline
     * price depend on how the calendar had been cut and left a listing priceless wherever the
     * cut missed. Weekly only: a daily rate is not comparable to it.
     *
     * But the rate list alone is not a price either. Taken whole it includes seasons already
     * past and seasons the boat is booked solid through, and the minimum lands on one of them
     * far more often than not -- a Bavaria 32 advertised at EUR 145 for seven days off a
     * November rate, on a hull whose free dates are all the following year and carry no rate
     * at all. The card then quoted a week nobody could buy beside a detail page correctly
     * saying the yacht was priced on request.
     *
     * So a rate counts only if it still lies ahead and overlaps a stretch the provider has not
     * sold. That is weaker than bookable_from below, which proves a whole legal charter
     * fits; it is a "from" price and may name a week whose exact shape the rules refuse. It is
     * not weaker in the way that matters: every listing priced here has something to sell, and
     * a listing with nothing to sell is priced on request on both surfaces rather than one.
     */
    left join lateral (
      select min(price.price_minor) as price_from_minor, min(price.currency) as currency
      from listing_price_period price
      where price.listing_id = l.id
        and price.kind = 'weekly'
        and price.end_date > current_date
        and exists (
          select 1
          from listing_free_period free
          where free.listing_id = l.id
            and free.end_date > current_date
            and free.start_date < price.end_date
            and free.end_date > price.start_date
        )
    ) rate on true
    /*
     * Availability is the span of the free stretches, which are the complement of occupancy.
     * A stretch counts as unconfirmed unless the provider priced that exact period on request,
     * which is what has_unconfirmed_availability has always meant: we inferred this.
     */
    left join lateral (
      select
        min(free.start_date) as available_from,
        max(free.end_date) as available_to,
        bool_or(
          not exists (
            select 1
            from availability_slot confirmed
            where confirmed.listing_id = l.id
              and confirmed.status = 'available'
              and confirmed.availability_confirmed
              and confirmed.start_date <= free.start_date
              and confirmed.end_date >= free.end_date
          )
        ) as has_unconfirmed_availability
      from listing_free_period free
      where free.listing_id = l.id
    ) avail on true
    /*
     * The first charter this listing would actually sell, which is what an undated search card
     * shows in place of a period of its own. Mirrors canCheckIn and offeredCheckOut in
     * packages/api/src/lib/availability-rules.ts, and has to keep mirroring them: the card sends
     * the visitor to a calendar that evaluates those, and a period this invents that they refuse
     * is exactly the dead end the pair exists to close.
     *
     * available_from cannot answer this: it is the first day nothing is sold, which is today for
     * most of the fleet and, on a Saturday-to-Saturday boat, never a day anyone could board.
     *
     * Both ends, not just the start. A start day alone proves nothing follows it, so the tail of
     * a gap too short to sell, and every mid-week day of a listing that turns around on
     * Saturdays, read as bookable and sent the card's date to a calendar with no end to offer.
     * Requiring the whole charter inside the free period is what rules those out.
     *
     * The lengths are the rules' own, one per rule: its minimum, stepped up to its check-out
     * weekday, dropped if that overshoots its maximum. A rule that states no minimum is read as
     * a week (ASSUMED_NIGHTS in availability-rules.ts) rather than as a single night, because it
     * is a provider that published nothing, not one selling nights.
     *
     * Weekdays are stepped onto arithmetically rather than by walking a day at a time -- dow is
     * 0 Sunday, the numbering listing_checkin_rule stores. Past periods are excluded first, so
     * the row count stays proportional to the season ahead.
     */
    left join lateral (
      select c.candidate as bookable_from, c.candidate + n.nights as bookable_to
      from listing_free_period free
      join listing_price_period price
        on price.listing_id = l.id
       and price.kind = 'weekly'
       and price.end_date > current_date
       and price.start_date < free.end_date
       and price.end_date > free.start_date
      left join listing_checkin_rule rule on rule.listing_id = l.id
      cross join lateral (
        select greatest(free.start_date, price.start_date, current_date) as opens
      ) w
      cross join lateral (
        select case
          when rule.checkin_weekday is null then w.opens
          else w.opens + ((rule.checkin_weekday - extract(dow from w.opens)::int + 7) % 7)
        end as candidate
      ) c
      cross join lateral (
        select greatest(coalesce(rule.min_nights, 7), 1) as base
      ) b
      cross join lateral (
        select case
          when rule.checkout_weekday is null then b.base
          else b.base
             + ((rule.checkout_weekday
                 - extract(dow from c.candidate + b.base)::int + 7) % 7)
        end as nights
      ) n
      where free.listing_id = l.id
        and free.end_date > current_date
        and c.candidate < least(free.end_date, price.end_date)
        and (rule.max_nights is null or n.nights <= rule.max_nights)
        and c.candidate + n.nights <= free.end_date
        /*
         * A charter that swallows a period the provider refused is one it will not sell either,
         * which is the containment rule wasRefused applies. Without this the card advertised the
         * cheapest week of the Shannon fleet -- free, priced, and declined by the vendor's own
         * offers engine -- and sent the visitor to a calendar that then greyed it out.
         */
        and not exists (
          select 1
          from listing_refused_period refused
          where refused.listing_id = l.id
            and refused.start_date >= c.candidate
            and refused.end_date <= c.candidate + n.nights
        )
      order by c.candidate, n.nights
      limit 1
    ) checkin on true
    /*
     * The rate for the week the card actually advertises, not the cheapest of the season.
     *
     * The card prints a price directly beside the bookable dates, so the two have to
     * describe one charter. Reading the season minimum instead put "EUR 4,557" next to 29 August
     * on a hull whose 29 August week is EUR 5,460 -- a EUR 1,533 understatement, and the quote
     * that follows the click is the one that has to be right.
     *
     * Null for a listing with no bookable period at all, where the minimum is still the honest
     * answer: nothing is being advertised for particular dates.
     */
    left join lateral (
      select
        price.price_minor,
        /*
         * The provider's own obligatory-extras total for this exact charter, where a confirmed
         * offer recorded one.
         *
         * Preferred over anything reassembled from the catalogue, which prices the same fees as
         * a ladder across season, charter length, party size, base, route and
         * percentage-of-charter - dimensions that differ per operator and are not all published
         * on every account. Rebuilding the sum there was wrong by a night's band on the Shannon
         * fleet and by a party-size band elsewhere; this is the number the quote will charge,
         * because both read the same offer.
         */
        (
          select slot.obligatory_extras_minor
          from availability_slot slot
          where slot.listing_id = l.id
            and slot.start_date = checkin.bookable_from
            and slot.end_date = checkin.bookable_to
            and slot.availability_confirmed
            and slot.obligatory_extras_minor is not null
          limit 1
        ) as obligatory_extras_minor
      from listing_price_period price
      where price.listing_id = l.id
        and price.kind = 'weekly'
        and price.start_date <= checkin.bookable_from
        and price.end_date > checkin.bookable_from
      order by price.price_minor
      limit 1
    ) week on true
    /*
     * What the advertised charter pays on top of the rate.
     *
     * One row per fee, choosing the variant that actually applies to the week on the card
     * rather than the cheapest anywhere. Providers file a fee as a ladder - Le Boat's moorings
     * fee is one row per night count, 60 EUR to six nights and 90 from seven - so the minimum
     * is a one-night price, and taking it advertised a weekly charter 30 EUR under the quote.
     *
     * Scoped to seasons overlapping what we sell, and excluding route-conditional fees: a
     * one-way fee is charged on a route the customer picks, and folding it in would inflate
     * every card for a charter almost none of them book.
     *
     * The night count falls back to a week when no bookable period is known, which is the
     * length the card's own label claims, and the price falls back to the cheapest variant
     * when the provider files no ladder at all.
     */
    left join lateral (
      select sum(applicable.price_minor)::int as unavoidable_minor
      from (
        select distinct on (extra.name) extra.price_minor
        from provider_extra_catalogue extra
        cross join lateral (
          select coalesce(checkin.bookable_to - checkin.bookable_from, 7) as nights
        ) span
        where extra.listing_id = l.id
          and extra.obligatory
          and not extra.one_way_only
          and (extra.season_end is null or extra.season_end >= current_date)
          and (
            extra.season_start is null
            or extra.season_start <= make_date(extract(year from current_date)::int + 1, 12, 31)
          )
        order by
          extra.name,
          /* A variant whose ladder covers this charter wins outright; otherwise cheapest. */
          (
            (extra.valid_nights_from is null or extra.valid_nights_from <= span.nights)
            and (extra.valid_nights_to is null or extra.valid_nights_to >= span.nights)
          ) desc,
          extra.price_minor
      ) applicable
    ) fees on true
    left join lateral (
      select bool_or(slot.status = 'option') as has_temporary_booking
      from availability_slot slot
      where slot.listing_id = l.id
    ) held on true
    left join lateral (
      select lt.value as description
      from listing_text lt
      where lt.listing_id = l.id and lt.kind = 'description' and lt.locale = 'en'
      limit 1
    ) txt on true
    left join lateral (
      select avg(rating)::numeric(3, 2) as rating, count(*)::integer as review_count
      from review review
      where review.listing_id = l.id
    ) rev on true
    where l.status = 'published'
      and ${listingScope(sql`l.id`, listingIds)}
    on conflict (listing_id) do update set
      slug = excluded.slug,
      title = excluded.title,
      category = excluded.category,
      crew_type = excluded.crew_type,
      builder = excluded.builder,
      model = excluded.model,
      model_canonical = excluded.model_canonical,
      operator = excluded.operator,
      base_id = excluded.base_id,
      base_name = excluded.base_name,
      city = excluded.city,
      location = excluded.location,
      region = excluded.region,
      country = excluded.country,
      lat = excluded.lat,
      lng = excluded.lng,
      base_email = excluded.base_email,
      base_phone = excluded.base_phone,
      base_website = excluded.base_website,
      base_check_in_time = excluded.base_check_in_time,
      base_check_out_time = excluded.base_check_out_time,
      length_m = excluded.length_m,
      cabins = excluded.cabins,
      berths = excluded.berths,
      heads = excluded.heads,
      showers = excluded.showers,
      year_built = excluded.year_built,
      sail_type = excluded.sail_type,
      security_deposit_minor = excluded.security_deposit_minor,
      security_deposit_currency = excluded.security_deposit_currency,
      deposit_insurance_included = excluded.deposit_insurance_included,
      pets_allowed = excluded.pets_allowed,
      rating = excluded.rating,
      review_count = excluded.review_count,
      main_image = excluded.main_image,
      gallery = excluded.gallery,
      amenities = excluded.amenities,
      price_from_minor = excluded.price_from_minor,
      currency = excluded.currency,
      available_from = excluded.available_from,
      available_to = excluded.available_to,
      bookable_from = excluded.bookable_from,
      bookable_to = excluded.bookable_to,
      has_unconfirmed_availability = excluded.has_unconfirmed_availability,
      has_temporary_booking = excluded.has_temporary_booking,
      searchable_text = excluded.searchable_text,
      updated_at = now()
  `);

  await db.execute(sql`
    delete from listing_search_doc doc
    where ${listingScope(sql`doc.listing_id`, listingIds)}
      and not exists (
      select 1
      from listing l
      where l.id = doc.listing_id and l.status = 'published'
    )
  `);
}

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
  bookable: number;
}> {
  const { rows } = await db.execute<{ docs: number; priced: number; bookable: number }>(sql`
    select
      count(*)::int as docs,
      count(price_from_minor)::int as priced,
      count(bookable_from)::int as bookable
    from listing_search_doc
  `);

  return rows[0] ?? { docs: 0, priced: 0, bookable: 0 };
}

export function rebuildListingSearchDocsForListings(
  db: NodePgDatabase<typeof schema>,
  listingIds: readonly string[],
) {
  return rebuildListingSearchDocs(db, { listingIds });
}

export async function rebuildSearchReadModelsAfterSync(
  db: NodePgDatabase<typeof schema>,
  options: RebuildListingSearchDocsOptions = {},
) {
  await rebuildListingSearchDocs(db, options);
}

/**
 * A provider sync deliberately never publishes what it creates — see the
 * comment in packages/providers/src/sync/catalogue-writer.ts — and this file's
 * own rebuild only picks up `status = 'published'` listings, so a freshly
 * synced catalogue stays invisible to search until something publishes it.
 *
 * Publishes every listing still in draft and rebuilds their search docs in one
 * call, so a caller can't publish without also refreshing the read model. No
 * review criteria: fine for an environment with no moderation queue yet; a real
 * one needs actual review before this runs unattended.
 *
 * `providerCode` narrows it to one provider's drafts. Without it, an operator
 * publishing a reviewed NauSYS import would also release every unreviewed
 * Booking Manager draft sitting beside it, which is precisely what the
 * draft-by-default rule exists to prevent.
 */
export async function publishDraftListings(
  db: NodePgDatabase<typeof schema>,
  options: { providerCode?: string } = {},
): Promise<{ publishedCount: number }> {
  const ofProvider = options.providerCode
    ? sql`exists (
        select 1 from listing_source ls
        join provider_record pr on pr.id = ls.provider_record_id
        join provider p on p.id = pr.provider_id
        where ls.listing_id = ${listing.id} and p.code = ${options.providerCode}
      )`
    : undefined;

  const published = await db
    .update(listing)
    .set({ status: "published" })
    .where(ofProvider ? and(eq(listing.status, "draft"), ofProvider) : eq(listing.status, "draft"))
    .returning({ id: listing.id });

  if (published.length > 0) {
    await rebuildListingSearchDocs(db, { listingIds: published.map((row) => row.id) });
  }

  return { publishedCount: published.length };
}

export async function resolveListingIdsForListingSources(
  db: NodePgDatabase<typeof schema>,
  listingSourceIds: readonly string[],
): Promise<string[]> {
  const sourceIds = uniqueIds(listingSourceIds);
  if (sourceIds.length === 0) return [];

  const rows = await db.execute<{ listingId: string }>(sql`
    select distinct listing_id as "listingId"
    from listing_source
    where id in (${sql.join(
      sourceIds.map((id) => sql`${id}`),
      sql`, `,
    )})
      and listing_id is not null
  `);

  return rows.rows.map((row) => row.listingId);
}

function uniqueIds(ids: readonly string[] | undefined): string[] {
  return [...new Set(ids?.filter(Boolean) ?? [])];
}

function listingScope(column: SQL, listingIds: readonly string[] | undefined) {
  if (!listingIds) return sql`true`;
  return sql`${column} in (${sql.join(
    listingIds.map((id) => sql`${id}`),
    sql`, `,
  )})`;
}
