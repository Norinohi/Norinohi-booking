import { sql, type SQL } from "drizzle-orm";

/*
 * Where a `provider_extra_catalogue` row, aliased `extra`, is charged, tested against the base
 * it was filed under. A row filed under no base, or naming no condition, applies everywhere:
 * silence is not a restriction, and a fee somebody still pays is the wrong thing to hide.
 */

/**
 * Only fees charged where this charter starts.
 *
 * The operator files a fee per base as well as per season, and most of them do: 130,535 of
 * NauSYS's 184,539 priced extras rows name the bases they apply at. A row whose list does not
 * include the base it was filed under is charged at some other base, and counting it put fees
 * on a card no charter from here pays.
 */
function chargedAtFiledBase(): SQL {
  return sql`(
    extra.valid_for_base_ids is null
    or extra.external_base_id is null
    or extra.external_base_id = any(extra.valid_for_base_ids)
  )`;
}

/**
 * The fees a charter starting at the filed base can be asked for, on any route from it. What the
 * detail page lists: a one-way fee from here belongs there, labelled as one.
 */
export function extraSoldFromFiledBase(): SQL {
  return sql`(
    ${chargedAtFiledBase()}
    and (
      extra.valid_routes is null
      or extra.external_base_id is null
      or exists (
        select 1
        from unnest(extra.valid_routes) route
        where split_part(route, '>', 1) = extra.external_base_id
      )
    )
  )`;
}

/**
 * The fees a return charter from the filed base pays, which is the charter a card advertises.
 * Booking Manager restricts a fee to routes, and one whose routes never return here is charged on
 * a charter the card is not selling.
 */
export function extraChargedOnReturnFromFiledBase(): SQL {
  return sql`(
    ${chargedAtFiledBase()}
    and (
      extra.valid_routes is null
      or extra.external_base_id is null
      or extra.external_base_id || '>' || extra.external_base_id = any(extra.valid_routes)
    )
  )`;
}
