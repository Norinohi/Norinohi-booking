import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { sql, type SQL } from "drizzle-orm";

import type * as schema from "../schema";

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
      operator,
      base_id,
      base_name,
      location,
      region,
      country,
      lat,
      lng,
      length_m,
      cabins,
      berths,
      heads,
      year_built,
      sail_type,
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
      cat.name,
      l.crew_type,
      bld.name,
      mdl.name,
      op.name,
      bs.id,
      bs.name,
      loc.name,
      rgn.name,
      cty.name,
      bs.lat,
      bs.lng,
      spec.length_m,
      spec.cabins,
      spec.berths,
      spec.heads,
      spec.year_built,
      spec.sail_type,
      l.deposit_insurance_included,
      l.pets_allowed,
      coalesce(rev.rating, 0)::numeric(3, 2),
      coalesce(rev.review_count, 0)::integer,
      media.main_image,
      coalesce(media.gallery, '[]'::jsonb),
      coalesce(amn.amenities, '[]'::jsonb),
      avail.price_from_minor,
      coalesce(avail.currency, l.default_currency),
      avail.available_from,
      avail.available_to,
      coalesce(avail.has_unconfirmed_availability, false),
      coalesce(avail.has_temporary_booking, false),
      concat_ws(
        ' ',
        l.title,
        cat.name,
        l.crew_type,
        bld.name,
        mdl.name,
        op.name,
        bs.name,
        loc.name,
        rgn.name,
        cty.name,
        spec.sail_type,
        amn.amenity_text
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
    left join lateral (
      select
        min(external_url) filter (where role = 'main') as main_image,
        jsonb_agg(external_url order by sort_order) as gallery
      from listing_media lm
      where lm.listing_id = l.id
    ) media on true
    left join lateral (
      select
        jsonb_agg(a.name order by a.name) as amenities,
        string_agg(a.name, ' ') as amenity_text
      from listing_amenity la
      join amenity a on a.id = la.amenity_id
      where la.listing_id = l.id
    ) amn on true
    left join lateral (
      select
        min(price_minor) filter (where status = 'available') as price_from_minor,
        min(currency) filter (where status = 'available') as currency,
        min(start_date) filter (where status = 'available') as available_from,
        max(end_date) filter (where status = 'available') as available_to,
        bool_or(status = 'available' and availability_confirmed = false) as has_unconfirmed_availability,
        bool_or(status = 'option') as has_temporary_booking
      from availability_slot slot
      where slot.listing_id = l.id and slot.status in ('available', 'option')
    ) avail on true
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
      operator = excluded.operator,
      base_id = excluded.base_id,
      base_name = excluded.base_name,
      location = excluded.location,
      region = excluded.region,
      country = excluded.country,
      lat = excluded.lat,
      lng = excluded.lng,
      length_m = excluded.length_m,
      cabins = excluded.cabins,
      berths = excluded.berths,
      heads = excluded.heads,
      year_built = excluded.year_built,
      sail_type = excluded.sail_type,
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
