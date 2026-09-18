import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq, sql } from "drizzle-orm";

import type * as schema from "../schema";
import { listing } from "../schema/listing";
import { markBestValue } from "./best-value";
import {
  listingAmenitiesLateral,
  listingDescriptionLateral,
  listingMediaLateral,
  listingReviewsLateral,
  projectedCrewTypeSql,
} from "./listing-doc-sql";
import { listingScope, uniqueIds } from "./listing-scope";
import { bestOfferSql, offerDocSql, offerSpreadSql } from "./offer-doc-sql";
import { adoptNearestPricedWeek, rebuildListingPeriodPrices } from "./period-prices";

export { listAdvertisedCharterPeriods, listUnadvertisedYachtIds } from "./advertised-periods";
export {
  hullsEligibleOn,
  listWeekdayCharterHulls,
  type WeekdayCharterHull,
} from "./checkin-weekdays";
export { MIN_LEAD_DAYS, PROVIDER_LEAD_DAYS, providerLeadDaysSql } from "./lead-time";
export { resolveListingIdsForListingSources } from "./listing-scope";
export { PERIOD_PRICE_COLUMNS } from "./period-prices";
export { readListingSearchDocStats } from "./search-doc-stats";

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
    with offer_doc as (
      ${offerDocSql(listingIds)}
    ),
    /*
     * The offer the card is for: cheapest all-in, ties to Booking Manager, then the offer id so
     * the document does not churn between two equal answers. Price, dates and terms all come
     * from this one row, because a card pricing one vendor's week beside another vendor's dates
     * would send the visitor to a quote that disagrees with it.
     */
    best as (
      ${bestOfferSql()}
    ),
    /*
     * The questions that are about the boat rather than about one seller. It is free if any
     * vendor says so, and the window is the union of theirs: search asks "is this boat free
     * then", and the quote settles which vendor sells it.
     */
    spread as (
      ${offerSpreadSql()}
    )
    insert into listing_search_doc (
      listing_id,
      slug,
      name,
      title,
      category,
      crew_type,
      builder,
      model,
      model_canonical,
      operator,
      operator_terms_and_conditions,
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
      max_guests,
      heads,
      showers,
      year_built,
      sail_type,
      security_deposit_minor,
      security_deposit_currency,
      security_deposit_when_insured_minor,
      deposit_insurance_included,
      pets_allowed,
      rating,
      review_count,
      main_image,
      gallery,
      amenities,
      price_from_minor,
      price_is_from,
      list_price_from_minor,
      currency,
      price_from_minor_eur,
      base_price_from_minor,
      base_price_from_minor_eur,
      best_offer_id,
      offer_count,
      available_from,
      available_to,
      bookable_from,
      bookable_to,
      searchable_text,
      created_at,
      updated_at
    )
    select
      l.id,
      l.slug,
      l.name,
      l.title,
      -- The marketplace category, not the vendor's: facets group on this column, and
      -- ungrouped vendor near-synonyms would each become their own facet. An
      -- unclassified category falls back to its own name rather than dropping out.
      coalesce(cat.canonical_name, cat.name),
      -- Believing the charge over the label. A hull filed bareboat whose skipper is an
      -- obligatory extra will be billed one either way, and the sidebar refuses to offer
      -- Bareboat for exactly that reason -- so leaving the column as the vendor sent it put a
      -- "Bareboat" chip on the card and returned the boat under the Bareboat filter, then sold
      -- a skippered charter. Never downgrades a full crew.
      ${projectedCrewTypeSql()},
      -- The brand, not the legal entity: providers send "Bavaria Yachtbau" and "Lagoon-Bénéteau",
      -- and grouped by those the same brand splits into several shipyard pages and filters.
      coalesce(bld.canonical_name, bld.name),
      mdl.name,
      -- The grouping name, like the category above: a model with no cabin suffix to strip has no
      -- canonical of its own, and writing that null left every model page without a value to
      -- group on.
      coalesce(mdl.canonical_name, mdl.name),
      op.name,
      op.terms_and_conditions,
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
      /*
       * What the boat can actually be sold to.
       *
       * Berths are what it sleeps; a vendor's offers engine may sell fewer and say so nowhere
       * -- Booking Manager's maxPeopleOnBoard is null on all 12,813 products we hold. What we
       * have instead is what it has already refused, learned at quote time, and one below that
       * is the most we know it will take.
       */
      least(spec.berths, best.guests_refused_from - 1) as max_guests,
      spec.heads,
      spec.showers,
      spec.year_built,
      spec.sail_type,
      /*
       * Only ever shown as "plus a refundable deposit"; a zero is the provider saying it takes
       * none, so it is stored as null and the card omits the line.
       *
       * So is a deposit the card cannot state in its own money. The figure here is the
       * catalogue's, in whatever currency the operator set, while the price beside it now
       * follows the vendor's confirmed answer -- which is how 94 cards came to offer a EUR
       * charter with a USD deposit under it. The vendor states the real one per period at
       * quote time (depositAmount, which the sidebar shows), so the honest card omits the
       * line rather than printing two currencies or inventing a conversion.
       */
      case
        when coalesce(best.security_deposit_currency, l.security_deposit_currency) is null
          or coalesce(best.security_deposit_currency, l.security_deposit_currency)
             = coalesce(best.price_currency, best.currency, best.default_currency, l.default_currency)
        then nullif(coalesce(best.security_deposit_minor, l.security_deposit_minor), 0)
      end,
      case
        when coalesce(best.security_deposit_minor, l.security_deposit_minor) > 0
          then coalesce(best.security_deposit_currency, l.security_deposit_currency)
      end,
      /*
       * The reduced deposit, under the same currency guard as the deposit itself: it is quoted
       * in that same currency, so a card that had to drop one must drop both rather than show a
       * "with insurance" figure beside no ordinary figure to compare it against.
       *
       * The nullif and the less-than test are the projection's rule restated in SQL - NauSYS
       * sends a bare 0 on most hulls and, on a few, a figure no lower than the ordinary deposit.
       * Neither is a reduction, and advertising one would promise the guest something the base
       * will not honour.
       */
      case
        when coalesce(best.security_deposit_currency, l.security_deposit_currency) is null
          or coalesce(best.security_deposit_currency, l.security_deposit_currency)
             = coalesce(best.price_currency, best.currency, best.default_currency, l.default_currency)
        then nullif(
          case
            when coalesce(best.security_deposit_when_insured_minor, l.security_deposit_when_insured_minor)
                 < coalesce(best.security_deposit_minor, l.security_deposit_minor)
            then coalesce(best.security_deposit_when_insured_minor, l.security_deposit_when_insured_minor)
          end, 0)
      end,
      coalesce(best.deposit_insurance_included, l.deposit_insurance_included),
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
      best.all_in_minor,
      /* A listing with no offer at all has no price to qualify, so it is not a "from" either. */
      coalesce(best.price_is_from, false),
      best.list_all_in_minor,
      coalesce(best.price_currency, best.currency, best.default_currency, l.default_currency),
      best.all_in_minor_eur,
      best.base_minor,
      best.base_minor_eur,
      best.offer_id,
      coalesce(spread.offer_count, 0),
      spread.available_from,
      spread.available_to,
      best.bookable_from,
      best.bookable_to,
      concat_ws(
        ' ',
        l.title,
        -- Both spellings: a guest searching the vendor's wording ("motor boat")
        -- and one searching the group ("motor yacht") must both hit this listing.
        cat.name,
        cat.canonical_name,
        ${projectedCrewTypeSql()},
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
    ${listingMediaLateral()}
    ${listingAmenitiesLateral()}
    left join best on best.listing_id = l.id
    left join spread on spread.listing_id = l.id
    ${listingDescriptionLateral()}
    ${listingReviewsLateral()}
    where l.status = 'published'
      and ${listingScope(sql`l.id`, listingIds)}
    on conflict (listing_id) do update set
      slug = excluded.slug,
      name = excluded.name,
      title = excluded.title,
      category = excluded.category,
      crew_type = excluded.crew_type,
      builder = excluded.builder,
      model = excluded.model,
      model_canonical = excluded.model_canonical,
      operator = excluded.operator,
      operator_terms_and_conditions = excluded.operator_terms_and_conditions,
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
      max_guests = excluded.max_guests,
      heads = excluded.heads,
      showers = excluded.showers,
      year_built = excluded.year_built,
      sail_type = excluded.sail_type,
      security_deposit_minor = excluded.security_deposit_minor,
      security_deposit_currency = excluded.security_deposit_currency,
      security_deposit_when_insured_minor = excluded.security_deposit_when_insured_minor,
      deposit_insurance_included = excluded.deposit_insurance_included,
      pets_allowed = excluded.pets_allowed,
      rating = excluded.rating,
      review_count = excluded.review_count,
      main_image = excluded.main_image,
      gallery = excluded.gallery,
      amenities = excluded.amenities,
      price_from_minor = excluded.price_from_minor,
      price_is_from = excluded.price_is_from,
      list_price_from_minor = excluded.list_price_from_minor,
      price_from_minor_eur = excluded.price_from_minor_eur,
      base_price_from_minor = excluded.base_price_from_minor,
      base_price_from_minor_eur = excluded.base_price_from_minor_eur,
      best_offer_id = excluded.best_offer_id,
      offer_count = excluded.offer_count,
      currency = excluded.currency,
      available_from = excluded.available_from,
      available_to = excluded.available_to,
      bookable_from = excluded.bookable_from,
      bookable_to = excluded.bookable_to,
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

  await rebuildListingPeriodPrices(db, listingIds);
  await adoptNearestPricedWeek(db, listingIds);
  await markBestValue(db, listingIds);
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
