import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { suggestedRouteFor } from "../routes/suggested-route";
import type * as schema from "../schema";
import { AMENITY_GROUPS, amenityGroupFor } from "./amenity-groups";
import { amenityIconFor } from "./amenity-icons";
import { normalizeSearchRow, searchColumns, type SearchRow } from "./columns";
import { crewOptionsFor } from "./crew";
import { foldFeeVariants, isSelectableExtra, pricedItem } from "./extras";
import { valueForLabel } from "./filters";
import { DEFAULT_LOCALE, facetTranslator, localizeSearchDocs } from "./localize";
import { normalizedKeySql } from "./normalize";
import { docHasMainsail } from "./mainsail";
import { placeLine, placeLineExcept } from "./place-line";
import { comparablePrice, recommendedSortValue } from "./pricing-sql";
import { nextCharterAfterLapseColumns } from "./sellable-starts";
import type {
  FaqCategory,
  ListingDetail,
  ListingReview,
  ListingSearchDoc,
  PriceBasis,
} from "./types";

export async function getListingByIdOrSlug(
  db: NodePgDatabase<typeof schema>,
  idOrSlug: string,
): Promise<ListingSearchDoc | undefined> {
  const rows = await db.execute<SearchRow>(sql`
    select ${searchColumns}${nextCharterAfterLapseColumns()}
    from listing_search_doc doc
    where doc.listing_id = ${idOrSlug} or doc.slug = ${idOrSlug}
    limit 1
  `);
  return rows.rows[0] ? normalizeSearchRow(rows.rows[0]) : undefined;
}

/**
 * Where a merged listing's old URL now leads.
 *
 * A confirmed duplicate keeps its `listing` row with `status = 'merged'` and a pointer at the
 * keeper, but its search document is dropped, so the detail page can only 404 on it. That loses
 * whatever ranking the old URL had earned and shows an error to somebody who followed a link to a
 * boat that still exists.
 *
 * Followed rather than read once: a keeper can itself be merged later, and stopping at the first
 * hop would redirect to a second dead page. The walk is depth-capped because the pointer is a
 * self-reference and a cycle would otherwise loop forever.
 *
 * Returns nothing unless the chain ends on a published listing, so a merge into something hidden
 * or draft still 404s instead of redirecting to a page that cannot be shown.
 */
const MERGE_CHAIN_DEPTH = 8;

export async function getMergedListingTarget(
  db: NodePgDatabase<typeof schema>,
  idOrSlug: string,
): Promise<{ listingId: string; slug: string } | undefined> {
  const rows = await db.execute<{ listingId: string; slug: string }>(sql`
    with recursive chain as (
      select l.id, l.slug, l.status, l.merged_into_listing_id, 0 as depth
      from listing l
      where (l.id = ${idOrSlug} or l.slug = ${idOrSlug}) and l.status = 'merged'
      union all
      select next.id, next.slug, next.status, next.merged_into_listing_id, chain.depth + 1
      from chain
      join listing next on next.id = chain.merged_into_listing_id
      where chain.status = 'merged' and chain.depth < ${MERGE_CHAIN_DEPTH}
    )
    select chain.id as "listingId", chain.slug
    from chain
    where chain.status = 'published'
    limit 1
  `);

  return rows.rows[0];
}

/**
 * The provider's own description in `locale`, or undefined when it ships none.
 *
 * `listing_search_doc` bakes provider prose into `searchable_text` only, so the detail read is
 * the one place it can still be recovered per locale. English is not a fallback here on purpose:
 * serving it under `lang="uk"` is the duplicate-content case the caller's generated copy avoids.
 */
async function providerDescription(
  db: NodePgDatabase<typeof schema>,
  listingId: string,
  locale: string,
): Promise<string | undefined> {
  const rows = await db.execute<{ value: string }>(sql`
    select value
    from listing_text
    where listing_id = ${listingId} and kind = 'description' and locale = ${locale}
    limit 1
  `);

  return rows.rows[0]?.value;
}

/**
 * The listing's amenities, one row per piece of equipment. Exported for its database suite.
 */
export function readListingAmenities(db: NodePgDatabase<typeof schema>, listingId: string) {
  return db.execute<{
    code: string | null;
    label: string;
    obligatory: boolean;
    crew: boolean;
    priceMinor: number | null;
    priceCurrency: string | null;
    popularRank: number | null;
    categories: string[] | null;
  }>(sql`
      /*
       * One row per piece of equipment, however each vendor spells it.
       *
       * The two providers keep separate amenity taxonomies, their codes are scoped per
       * provider, so Autopilot exists once as each vendor's own row, and a listing both of
       * them sell carries both. Folded on the amenity's canonical name the same way the search
       * documents fold it, so a hull sold by both does not list "Bimini" above "Bimini top".
       * An included row wins over a priced one: the list answers "what does this yacht have".
       */
      with amenities as (
        select
          a.code,
          a.name,
          coalesce(a.canonical_name, a.name) as label,
          a.crew,
          a.amenity_category_id,
          la.obligatory,
          la.price_minor,
          la.price_currency,
          /* Folded once here and referred to by name. Spelled out twice instead, the DISTINCT ON
             and the ORDER BY are two expressions over the same columns but different bind
             parameters, and Postgres compares them before it knows the values: "DISTINCT ON
             expressions must match initial ORDER BY expressions". */
          ${normalizedKeySql(sql`coalesce(a.canonical_name, a.name)`)} as folded
        from listing_amenity la
        join amenity a on a.id = la.amenity_id
        where la.listing_id = ${listingId}
      ),
      /*
       * The curated order the amenity list is shown in, off the same facet_media rank the
       * search cards read. Two vendor spellings of one amenity carry one rank between them --
       * the lowest wins, whichever of the two this listing published. Each facet row is folded
       * once per read, not once per amenity.
       */
      ranks as (
        select ${normalizedKeySql(sql`fm.value`)} as folded, min(fm.popular_rank) as popular_rank
        from facet_media fm
        where fm.kind = 'equipment'
        group by 1
      ),
      /*
       * Every vendor category this listing files the amenity under, not just the one whose row
       * wins the DISTINCT ON below. A hull both providers sell publishes the fitting twice under
       * two taxonomies, and which of the two survives the fold is decided by name order -- so
       * reading the category off the surviving row alone would file one boat's autopilot under
       * Navigation and the next boat's under the vendor's catch-all.
       */
      categories as (
        select am.folded, array_agg(distinct ac.name) as categories
        from amenities am
        join amenity_category ac on ac.id = am.amenity_category_id
        group by am.folded
      )
      select distinct on (am.folded)
        am.code,
        am.label,
        am.crew,
        am.obligatory,
        am.price_minor as "priceMinor",
        am.price_currency as "priceCurrency",
        r.popular_rank as "popularRank",
        c.categories
      from amenities am
      left join ranks r on r.folded = am.folded
      left join categories c on c.folded = am.folded
      order by am.folded, am.price_minor nulls first, am.name asc, am.code asc
    `);
}

/**
 * Folds an extra's name the way `extra_label_translation.name_key` is written.
 *
 * Mirrors normalizedKey in normalize.ts, so "Boat Cleaning" and "boat cleaning" are one fee.
 * Case and punctuation only: "Beach towel" and "Beach towels" stay separate entries, because
 * collapsing a plural is a judgement the dictionary should make explicitly rather than the
 * join make silently.
 */
export async function getListingDetailByIdOrSlug(
  db: NodePgDatabase<typeof schema>,
  idOrSlug: string,
  locale: string = DEFAULT_LOCALE,
): Promise<ListingDetail | undefined> {
  const raw = await getListingByIdOrSlug(db, idOrSlug);
  if (!raw) return undefined;

  const translate = await facetTranslator(db, locale);
  const [localized] = await localizeSearchDocs(db, [raw], locale, translate);
  const listing = localized ?? raw;

  const [infoRows, amenityRows, extraRows, faqRows, reviews, popularYachts, prose, route] =
    await Promise.all([
      db.execute<{
        beamM: string | null;
        draftM: string | null;
        engines: number | null;
        enginePower: string | null;
        fuelCapacity: number | null;
        waterCapacity: number | null;
        checkInTime: string | null;
        checkOutTime: string | null;
        videoUrl: string | null;
        tourUrl: string | null;
      }>(sql`
      select
        spec.beam_m as "beamM",
        spec.draft_m as "draftM",
        spec.engines,
        spec.engine_power as "enginePower",
        spec.fuel_capacity as "fuelCapacity",
        spec.water_capacity as "waterCapacity",
        bs.check_in_time as "checkInTime",
        bs.check_out_time as "checkOutTime",
        /* Read from the offer the card is priced from, like the extras: two vendors selling
           one hull can film it separately, and the page shows one of them. */
        coalesce(o.video_url, l.video_url) as "videoUrl",
        coalesce(o.tour_url, l.tour_url) as "tourUrl"
      from listing l
      left join listing_specification spec on spec.listing_id = l.id
      left join base bs on bs.id = l.home_base_id
      left join listing_offer o on o.id = ${listing.bestOfferId ?? null}::text
      where l.id = ${listing.listingId}
      limit 1
    `),
      readListingAmenities(db, listing.listingId),
      db.execute<{
        source: string;
        kind: string;
        externalId: string;
        label: string;
        sourceLabel: string;
        obligatory: boolean;
        crewRole: string | null;
        priceMinor: number | null;
        priceCurrency: string | null;
        priceMeasure: string | null;
        calculationType: string | null;
        percentage: string | null;
        payableInBase: boolean | null;
        oneWayOnly: boolean;
        note: string | null;
      }>(sql`
      select
        extra.source,
        extra.kind,
        extra.external_id as "externalId",
        /* Three sources in order of authority: the provider's own wording for this exact id,
           the curated label for a fee written that way by any provider, then the name it
           shipped with. English matches nothing in either table by design, because the last
           fallback already is English. */
        coalesce(translation.label, curated.label, extra.name) as label,
        extra.name as "sourceLabel",
        extra.obligatory,
        extra.crew_role as "crewRole",
        extra.price_minor as "priceMinor",
        extra.price_currency as "priceCurrency",
        extra.price_measure as "priceMeasure",
        extra.calculation_type as "calculationType",
        extra.percentage,
        extra.payable_in_base as "payableInBase",
        extra.one_way_only as "oneWayOnly",
        extra.note
      from provider_extra_catalogue extra
      left join provider_extra_translation translation
        on translation.source = extra.source
        and translation.kind = extra.kind
        and translation.external_id = extra.external_id
        and translation.locale = ${locale}
      left join extra_label_translation curated
        on curated.name_key = ${normalizedKeySql(sql`extra.name`)}
        and curated.locale = ${locale}
      /*
       * Scoped to the offer the card is priced from, never to the listing.
       *
       * The page shows one price and one set of terms, and they have to be the same vendor's:
       * across a merged listing the two vendors' cleaning fees folded into a single range
       * neither of them charges. Falls back to the listing while a document has no best offer
       * recorded yet, which is a listing with nothing sellable on it anyway.
       */
      where (
        case
          when ${listing.bestOfferId ?? null}::text is null then extra.listing_id = ${listing.listingId}
          else extra.listing_offer_id = ${listing.bestOfferId ?? null}::text
        end
      )
        /*
         * Only fees whose season overlaps what we actually sell.
         *
         * Providers version a fee by season rather than replacing it, so this listing carries
         * boat cleaning three times at once - 150 for 2026, 155 for 2027, 160 for 2028 - and
         * showing all three made the page quote a 150-160 range no bookable charter could land
         * in. The upper bound is the end of next year because that is the horizon both provider
         * syncs fetch (this year and the next), so a 2028 price is for dates nothing here can
         * sell yet. Rows stating no season are kept at both ends: silence is not an expiry,
         * and a fee somebody still has to pay is the wrong thing to hide.
         */
        and (extra.season_end is null or extra.season_end >= current_date)
        and (
          extra.season_start is null
          or extra.season_start <= make_date(extract(year from current_date)::int + 1, 12, 31)
        )
        /*
         * And only fees charged at the base this listing sails from. A provider states the
         * bases a price applies at alongside its season, and a row filed under one base but
         * valid only at others is somebody else's charter: listing it here told the customer
         * about a fee they will never be asked for.
         */
        and (
          extra.valid_for_base_ids is null
          or extra.external_base_id is null
          or extra.external_base_id = any(extra.valid_for_base_ids)
        )
      /* Ordered on the vendor's name, not the translated one, so the sections keep the same
         order in every locale. */
      order by extra.obligatory desc, extra.price_minor, extra.name asc
    `),
      /*
       * Listing-specific entries and site-wide ones in one read, the listing's own first.
       * A site-wide entry is the row with a null listing_id; `category` groups it on the page
       * and orders it here by the enum's declaration order, which is the client's order.
       *
       * An entry with no answer is dropped rather than returned blank: the client sent the
       * questions before the answers, and a question rendered under a heading with nothing
       * under it reads as a broken page rather than as work in progress.
       *
       * Locale is matched exactly, with no fallback, for the same reason providerDescription
       * refuses one: an English answer served under lang="uk" is worse than a shorter page.
       */
      db.execute<{
        id: string;
        question: string;
        answer: string;
        category: FaqCategory | null;
      }>(sql`
      select id, question, answer, category
      from faq
      where (listing_id = ${listing.listingId} or listing_id is null)
        and locale = ${locale}
        and nullif(btrim(answer), '') is not null
      order by (listing_id is null), category, sort_order asc, created_at asc
    `),
      listListingReviews(db, listing.listingId),
      /* Localized with the same translator as the page around them: these render as ordinary
         search cards, and a Ukrainian page whose "popular yachts" strip says "Sailing yacht"
         next to its own "Вітрильна яхта" is the drift the shared table exists to prevent. */
      listSimilarListings(db, listing.listingId).then((docs) =>
        localizeSearchDocs(db, docs, locale, translate),
      ),
      providerDescription(db, listing.listingId, locale),
      suggestedRouteFor(db, listing.baseId, locale),
    ]);
  const info = infoRows.rows[0];
  const amenities = amenityRows.rows.map((item) => ({
    ...item,
    code: item.code ?? valueForLabel(item.label),
  }));
  /*
   * Translated after the code is derived, never before: the code is what the amenity filter
   * matches on, and a Spanish one matches nothing.
   *
   * Ordered by heading, then curated rank within it. The page groups a boat's two dozen fittings
   * under six headings, and the fold that hides the tail runs down that same order, so the rank
   * decides which navigation gear a visitor sees before expanding rather than which of all
   * twenty-four. Air conditioning sells a charter and a bilge pump handle does not, but they are
   * no longer competing for the same slot. Unranked amenities keep the vendor's own order behind
   * the ranked ones rather than being dropped -- the section still lists everything the boat has.
   */
  const includedAmenities = amenities
    .filter((item) => !item.crew && item.priceMinor === null)
    .map((item, index) => ({
      item,
      index,
      /*
       * Grouped off the vendor's own label, never the translated one, for the same reason the
       * code is derived before translation: the override table is keyed on the English spelling
       * both providers publish, and a Ukrainian heading lookup would match nothing.
       */
      group: amenityGroupFor(item.label, item.categories ?? []),
    }))
    .sort((left, right) => {
      /* Heading order first: the page renders this array in order under six headings, so the
         curated rank orders within a group rather than across the whole list. */
      const byGroup = AMENITY_GROUPS.indexOf(left.group) - AMENITY_GROUPS.indexOf(right.group);
      if (byGroup !== 0) return byGroup;

      const leftRank = left.item.popularRank;
      const rightRank = right.item.popularRank;
      if (leftRank !== rightRank) {
        if (leftRank === null) return 1;
        if (rightRank === null) return -1;
        return leftRank - rightRank;
      }
      return left.index - right.index;
    })
    .map(({ item, group }) => ({
      code: item.code,
      label: translate ? translate("equipment", item.label) : item.label,
      group,
      /* Resolved off the vendor's label for the same reason the group is, and null where no
         icon has been drawn for this fitting yet -- the page falls back to the group's own. */
      icon: amenityIconFor(item.label),
    }));
  /*
   * Extras come from provider_extra_catalogue, not from listing_amenity. The two
   * answer different questions — what the yacht has versus what it costs extra —
   * and providers key them in separate id spaces. Reading both from one set of
   * columns is what left these sections empty for every synced listing: the
   * catalogue sync only ever knew the yacht's standard equipment.
   *
   * The code is the provider id space plus its id, which is stable across syncs
   * and cannot collide a service with an equipment of the same number.
   */
  const extras = extraRows.rows.map((item) => ({
    code: `${item.kind}:${item.externalId}`,
    label: item.label,
    sourceLabel: item.sourceLabel,
    obligatory: item.obligatory,
    crewRole: item.crewRole,
    priceMinor: item.priceMinor,
    priceCurrency: item.priceCurrency,
    priceMeasure: item.priceMeasure,
    calculationType: item.calculationType,
    percentage: item.percentage,
    payableInBase: item.payableInBase,
    oneWayOnly: item.oneWayOnly,
    note: item.note,
    selectable: isSelectableExtra(item.source, item.kind),
  }));
  const mandatoryExtras = foldFeeVariants(
    extras.filter((item) => item.obligatory),
    listing.currency,
  );
  // Crew is deliberately not in optionalExtras: the sidebar buys it through the
  // Crew control, and listing it twice would let the customer add a skipper the
  // crew type does not include.
  const optionalExtras = extras
    .filter((item) => !item.obligatory && item.crewRole === null)
    .map((item) => ({
      ...pricedItem(item, listing.currency),
      selectable: item.selectable,
    }));
  /*
   * Two sources because the two kinds of listing carry crew differently. A seeded
   * listing flags the amenity itself; a synced one has no such flag from the vendor,
   * so the role was read off the service name at projection time and lives on the
   * extras catalogue instead.
   *
   * Either way the code is the bare role, not the provider's id, because
   * `crewOptionsFor` decides what the Crew control may offer by looking for
   * `skipper`/`hostess`/`cook`.
   */
  const crewRoles = [
    ...amenities
      .filter((item) => item.crew && item.priceMinor !== null)
      .map((item) => pricedItem(item, listing.currency)),
    ...extras
      .filter((item) => item.crewRole !== null)
      .map((item) => pricedItem({ ...item, code: item.crewRole ?? item.code }, listing.currency)),
  ];
  /* Crew the operator bills whatever the customer picks, which is what decides whether
     bareboat is a choice this listing can honestly offer. */
  const obligatoryCrewRoles = extras
    .filter((item) => item.obligatory && item.crewRole !== null)
    .map((item) => item.crewRole ?? "");
  const crewOptions = crewOptionsFor(
    listing.crewType,
    crewRoles.map((role) => role.code),
    obligatoryCrewRoles,
  );

  return {
    ...listing,
    /*
     * Null rather than the generated sentence when the provider ships no prose for this locale.
     * The generated copy is translated, and its translations live in the web app's message files,
     * so building it here would mean shipping Ukrainian string templates from the database package.
     */
    description: prose ?? null,
    overview: overviewFor(listing, info),
    media: { videoUrl: info?.videoUrl ?? null, tourUrl: info?.tourUrl ?? null },
    includedAmenities,
    mandatoryExtras,
    optionalExtras,
    crew: { options: crewOptions, roles: crewRoles },
    importantInformation: {
      charterCompany: listing.operator,
      yachtPickupAddress: placeLine(listing.baseName, listing.location, listing.country),
      /*
       * Times only. These carried `available_from`/`available_to`, which are the first and last
       * dates the boat is free anywhere in the horizon — not this charter's pickup and drop-off.
       * A listing page has no charter yet, so it has no date to state; the base's times hold
       * whatever dates the visitor later picks.
       */
      yachtPickup: { time: info?.checkInTime ?? null },
      yachtDropOff: { time: info?.checkOutTime ?? null },
      cancellationPaymentPolicies: "varies_by_selection",
      /* Off the crew this listing can actually be taken with, not off the operator's label:
         a hull whose skipper is an obligatory charge never sails without one, so telling its
         customer to bring a licence asks for a document the charter does not need. */
      sailingLicenseRequired: crewOptions.includes("bareboat") ? "required" : "not_required",
      /*
       * Absence of the flag is not a prohibition. NauSYS publishes no pets field at all, so
       * `pets_allowed` is false for the whole fleet, and the old copy turned "we were not told"
       * into "not permitted" on 109 listings. Ask the base instead of inventing its policy.
       */
      pets: listing.petsAllowed ? "allowed_with_confirmation" : "ask_base",
      paymentMethodsAcceptedByCharterCompany: ["card", "bank_transfer", "cash"],
      marinaInformation: {
        marina: listing.baseName,
        /*
         * The surroundings the marina's own name has not already given. A NauSYS base is named
         * after its location, so the raw pair read "X is located in X, Bahamas"; the region is
         * the next-widest thing to say once the location adds nothing.
         */
        location: placeLineExcept(listing.baseName, listing.location) || listing.region,
        country: listing.country,
      },
      marinaContact: {
        name: listing.baseName,
        address: placeLine(listing.baseName, listing.location, listing.country),
        email: listing.baseEmail,
        phone: listing.basePhone,
        website: listing.baseWebsite,
      },
      map: { lat: listing.lat ?? 0, lng: listing.lng ?? 0 },
    },
    suggestedRoute: route,
    reviews,
    faq: faqRows.rows,
    popularYachts,
  };
}

export async function listListingReviews(
  db: NodePgDatabase<typeof schema>,
  listingId: string,
): Promise<ListingReview[]> {
  const rows = await db.execute<{
    id: string;
    rating: number;
    author: string | null;
    body: string | null;
  }>(sql`
    select id, rating, author, body
    from review
    where listing_id = ${listingId}
    order by created_at desc
    limit 20
  `);

  return rows.rows.map((review) => ({
    id: review.id,
    rating: review.rating,
    author: review.author ?? "Guest",
    body: review.body ?? "",
  }));
}

export async function listSimilarListings(
  db: NodePgDatabase<typeof schema>,
  listingId: string,
  limit = 3,
  basis?: PriceBasis,
): Promise<ListingSearchDoc[]> {
  const listing = await getListingByIdOrSlug(db, listingId);
  if (!listing) return [];

  const rows = await db.execute<SearchRow>(sql`
    select ${searchColumns}${nextCharterAfterLapseColumns()}
    from listing_search_doc doc
    where doc.listing_id <> ${listing.listingId}
      and (
        doc.category = ${listing.category}
        or doc.country = ${listing.country}
        or doc.region = ${listing.region}
      )
    order by ${recommendedSortValue} desc, ${comparablePrice(basis)} asc nulls last, doc.listing_id asc
    limit ${limit}
  `);

  return rows.rows.map(normalizeSearchRow);
}

/**
 * The spec rows, as data rather than as sentences.
 *
 * Every English word that used to live here — the labels, "Not specified", "Unknown", the
 * "Yacht" fallback — is now the web app's to write, per locale. What stays is the number and
 * its SI unit, which read the same in all four.
 */
function overviewFor(
  listing: ListingSearchDoc,
  info:
    | {
        beamM: string | null;
        draftM: string | null;
        engines: number | null;
        enginePower: string | null;
        fuelCapacity: number | null;
        waterCapacity: number | null;
      }
    | undefined,
): { code: string; label: string; value: string | null }[] {
  return [
    { code: "location", label: "Location", value: placeLine(listing.location, listing.country) },
    {
      code: "year",
      label: "Year",
      value: listing.yearBuilt === null ? null : String(listing.yearBuilt),
    },
    { code: "boat-type", label: "Boat type", value: listing.category },
    { code: "cabins", label: "Cabins", value: String(listing.cabins ?? 0) },
    { code: "bathrooms", label: "Bathrooms", value: String(listing.heads ?? 0) },
    ...(listing.showers === null
      ? []
      : [{ code: "showers", label: "Showers", value: String(listing.showers) }]),
    { code: "length", label: "Length", value: metresValue(listing.lengthM) },
    ...(docHasMainsail(listing)
      ? [{ code: "mainsail", label: "Type of mainsail", value: listing.sailType }]
      : []),
    { code: "draught", label: "Draught", value: metresValue(info?.draftM) },
    { code: "beam", label: "Beam", value: metresValue(info?.beamM) },
    {
      code: "fuel-tank",
      label: "Fuel tank",
      value: info?.fuelCapacity ? `${info.fuelCapacity} l` : null,
    },
    {
      code: "water-tank",
      label: "Water tank",
      value: info?.waterCapacity ? `${info.waterCapacity} l` : null,
    },
    {
      code: "engine",
      label: "Engine",
      value: [info?.engines, info?.enginePower].filter(Boolean).join(" x ") || null,
    },
  ];
}

function metresValue(value: string | null | undefined): string | null {
  return value ? `${Number(value).toFixed(2)} m` : null;
}
