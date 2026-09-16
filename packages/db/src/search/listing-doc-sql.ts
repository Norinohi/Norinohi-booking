import { MEDIA_RANKED_PROVIDERS, UNRANKED_MEDIA_RANK } from "@yacht-charter/env/providers";
import { sql, type SQL } from "drizzle-orm";

import { normalizedKeySql } from "./localize";

/**
 * Booking Manager photographs better than NauSYS, so its rows front a listing
 * that carries both (architecture §3). Ranked by `mediaRank` in the provider
 * registry and inlined, as the literal it replaced was, so the statement text
 * does not change. Mirrors `pickPrimaryImage` in
 * packages/api/src/services/match.ts; the two must agree or the search card and
 * the duplicate-review screen show different boats.
 */
const MEDIA_SOURCE_RANK = sql.raw(
  `case lm.source ${MEDIA_RANKED_PROVIDERS.map(({ key, rank }) => `when '${key}' then ${rank}`).join(" ")} else ${UNRANKED_MEDIA_RANK} end`,
);

/**
 * An admin's pinned choice, ahead of the rule.
 *
 * `listing_field_source` is where the resolver records which offer supplies each group, and a
 * `locked` row is a person overruling it. Media is resolved here rather than by the resolver —
 * the rank below is the whole decision — so without this the override was recorded, shown as
 * pinned, and changed nothing at all.
 */
const PINNED_OFFER = (field: string) => sql`(
  select f.listing_offer_id
  from listing_field_source f
  where f.listing_id = l.id and f.field = ${sql.raw(`'${field}'`)} and f.locked
)`;

const PINNED_MEDIA_FIRST = sql`case when lm.listing_offer_id = ${PINNED_OFFER("media")} then 0 else 1 end`;

const MEDIA_ROLE_RANK = sql`case lm.role when 'main' then 0 when 'gallery' then 1 else 2 end`;

/** The crew type a card states, from offer `best` over listing `l`. */
export function projectedCrewTypeSql(): SQL {
  return sql`case
        when best.has_obligatory_skipper
          and coalesce(best.crew_type, l.crew_type, 'bareboat') = 'bareboat'
        then 'skipper'
        else coalesce(best.crew_type, l.crew_type)
      end`;
}

/** The `media` lateral on listing `l`. */
export function listingMediaLateral(): SQL {
  return sql`/*
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
          select coalesce(
            case when pma.status = 'uploaded' then pma.bunny_cdn_url end,
            lm.external_url
          )
          from listing_media lm
          left join provider_media_asset pma
            on pma.id = lm.provider_media_asset_id
          where lm.listing_id = l.id
          order by ${PINNED_MEDIA_FIRST}, ${MEDIA_SOURCE_RANK}, ${MEDIA_ROLE_RANK}, lm.sort_order
          limit 1
        ) as main_image,
        (
          select jsonb_agg(
            coalesce(
              case when pma.status = 'uploaded' then pma.bunny_cdn_url end,
              lm.external_url
            )
            order by ${PINNED_MEDIA_FIRST}, ${MEDIA_SOURCE_RANK}, lm.sort_order
          )
          from listing_media lm
          left join provider_media_asset pma
            on pma.id = lm.provider_media_asset_id
          where lm.listing_id = l.id
        ) as gallery
    ) media on true`;
}

/** The `amn` lateral on listing `l`. */
export function listingAmenitiesLateral(): SQL {
  return sql`/*
     * Equipment, folded to one entry per thing however each vendor spells it.
     *
     * The two providers keep separate amenity taxonomies — codes are scoped per provider, so
     * Autopilot exists once as each vendor's own row — and a listing both of them sell carries
     * both. Thirty names overlap that way today, and unfolded they would each appear twice on
     * the card and twice in the searchable text. Folded on the name the same way the facet
     * dictionary folds it, since that is the only thing the two rows share.
     *
     * The amenity's canonical name is what makes the fold reach the pairs that are spelled
     * differently rather than merely cased differently: NauSYS's "Bimini top" carries "Bimini"
     * there, so it groups with Booking Manager's own row instead of standing beside it as a
     * second facet option. The vendor's wording is kept in the searchable text, so a charterer
     * who types what one vendor calls it still finds the boat.
     *
     * Included by any vendor counts as included: the array answers what the yacht has, and the
     * priced crew roles are read from their own table.
     */
    left join lateral (
      select
        jsonb_agg(folded.name order by folded.name) filter (where folded.included) as amenities,
        string_agg(folded.text, ' ') as amenity_text
      from (
        select
          min(coalesce(a.canonical_name, a.name)) as name,
          string_agg(distinct a.name, ' ') as text,
          bool_or(la.obligatory = false and la.price_minor is null) as included
        from listing_amenity la
        join amenity a on a.id = la.amenity_id
        where la.listing_id = l.id
        group by ${normalizedKeySql(sql`coalesce(a.canonical_name, a.name)`)}
      ) folded
    ) amn on true`;
}

/** The `txt` lateral on listing `l`. */
export function listingDescriptionLateral(): SQL {
  return sql`left join lateral (
      select lt.value as description
      from listing_text lt
      where lt.listing_id = l.id and lt.kind = 'description' and lt.locale = 'en'
      /* Same as the media above: a pinned vendor's prose wins, otherwise whichever is there. */
      order by case when lt.listing_offer_id = ${PINNED_OFFER("description")} then 0 else 1 end
      limit 1
    ) txt on true`;
}

/** The `rev` lateral on listing `l`. */
export function listingReviewsLateral(): SQL {
  return sql`left join lateral (
      select avg(rating)::numeric(3, 2) as rating, count(*)::integer as review_count
      from review review
      where review.listing_id = l.id
    ) rev on true`;
}
