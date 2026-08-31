/**
 * Fills the offer dimension in, and repairs the listings the old matcher fused.
 *
 * Migration 0074 adds `listing_offer` and a nullable `listing_offer_id` on everything
 * commercial. Nothing is written by drizzle-kit, so this is the step that populates them.
 * It is idempotent, reports before it writes, and defaults to a dry run:
 *
 *   pnpm --filter @yacht-charter/providers offers:backfill
 *   pnpm --filter @yacht-charter/providers offers:backfill -- --apply
 *
 * Three jobs, in order.
 *
 * **1. Split the fused listings.** `decideListingMatch` used to auto-match a new record onto
 * an existing listing when `company|base|model|year|name` agreed. Booking Manager publishes
 * no per-hull name — its `name` is the product line, "Moorings 4200/3/3 Exclusive" — so that
 * tuple is identical across a whole fleet at one base and the rule fused them: 172 listings
 * holding 486 records, and because prices and calendars are keyed by listing, 314 boats
 * overwritten into invisibility. The matcher no longer does this; these are its leftovers.
 * One record keeps the original listing and the rest get their own, so a vendor id means one
 * boat again.
 *
 * The keeper is the record holding the most priced and dated rows, so the listing that keeps
 * the public URL is the one with a calendar behind it. Every child row already carries the
 * `listing_source_id` that wrote it, so nothing has to be guessed and nothing is lost: the
 * rows move with the record that produced them.
 *
 * **2. One offer per attached source**, carrying the listing's commercial columns forward.
 * They are a placeholder until the re-projection writes each vendor's own, which matters on
 * a merged listing where the stored values are whichever provider synced last.
 *
 * **3. Point every child row at its offer.** The four period tables resolve through
 * `listing_source_id`, media and extras through their `source` provider code. The four
 * catalogue tables that never had a source column — texts, amenities, check-in rules,
 * one-way rules — attribute to the sole offer where a listing has one. On a listing genuinely
 * merged across two providers those rows are whichever vendor synced last and cannot be
 * attributed to either; they are left null, counted at the end, and rewritten per offer by
 * the re-projection. Guessing a vendor for them would put words in one provider's mouth.
 */
import { db } from "@yacht-charter/db";
import { sql } from "drizzle-orm";

const argv = process.argv.slice(2);
const apply = argv.includes("--apply");

/** Rows touched per statement, to keep any one of them off a long lock. */
const CHUNK = 5000;

type Count = { count: number };

async function scalar(query: ReturnType<typeof sql>): Promise<number> {
  const result = await db.execute<Count>(query);
  return Number(result.rows[0]?.count ?? 0);
}

/* ------------------------------------------------------------------ report */

async function report(): Promise<void> {
  const [sources, attached, orphanSources, fusedListings, fusedSources] = await Promise.all([
    scalar(sql`select count(*)::int as count from listing_source`),
    scalar(sql`select count(*)::int as count from listing_source where listing_id is not null`),
    scalar(sql`select count(*)::int as count from listing_source where listing_id is null`),
    scalar(sql`
      select count(*)::int as count from (
        select ls.listing_id
        from listing_source ls
        join provider_record pr on pr.id = ls.provider_record_id
        where ls.listing_id is not null
        group by ls.listing_id, pr.provider_id
        having count(*) > 1
      ) fused`),
    scalar(sql`
      select coalesce(sum(sources), 0)::int as count from (
        select count(*) - 1 as sources
        from listing_source ls
        join provider_record pr on pr.id = ls.provider_record_id
        where ls.listing_id is not null
        group by ls.listing_id, pr.provider_id
        having count(*) > 1
      ) fused`),
  ]);

  console.log(`listing_source rows: ${sources} (${attached} attached, ${orphanSources} detached)`);
  console.log(
    `fused listings to split: ${fusedListings}, records moving to new listings: ${fusedSources}`,
  );

  /*
   * Rows on a listing that will still hold more than one offer after the split, which is a
   * genuine cross-provider merge. The sole-offer rule cannot reach them.
   */
  const unattributable = await db.execute<{ table_name: string; count: number }>(sql`
    with fused as (
      select ls.listing_id
      from listing_source ls
      join provider_record pr on pr.id = ls.provider_record_id
      where ls.listing_id is not null
      group by ls.listing_id
      having count(distinct pr.provider_id) > 1
    )
    select 'listing_text' as table_name, count(*)::int as count from listing_text where listing_id in (select listing_id from fused)
    union all
    select 'listing_amenity', count(*)::int from listing_amenity where listing_id in (select listing_id from fused)
    union all
    select 'listing_checkin_rule', count(*)::int from listing_checkin_rule where listing_id in (select listing_id from fused)
    union all
    select 'listing_one_way_rule', count(*)::int from listing_one_way_rule where listing_id in (select listing_id from fused)
  `);
  for (const row of unattributable.rows) {
    if (row.count > 0) {
      console.log(
        `${row.table_name}: ${row.count} rows on merged listings, left for the re-projection`,
      );
    }
  }

  const missingPayload = await scalar(sql`
    select count(*)::int as count
    from provider_record
    where resource_type = 'yacht' and active and raw_payload_id is null`);
  if (missingPayload > 0) {
    console.log(
      `WARNING: ${missingPayload} active yacht records have no raw payload; the re-projection cannot rebuild those and they need a real catalogue sync`,
    );
  }
}

/* ------------------------------------------------------------------- split */

/**
 * The records that must leave the listing they were fused onto, and where each one goes.
 *
 * Ranked by how much priced and dated data the record holds, so the boat that keeps the
 * original listing — and its slug, and its public URL — is the one with a calendar behind it.
 * Rank 1 stays put. The id is derived from the record's own id rather than minted, which is
 * what makes every statement below re-runnable.
 *
 * Stable until `relinkSources` runs, because nothing before that changes what it reads. Both
 * halves of the split therefore compute it and see the same answer.
 */
const MOVING = sql`
  fused as (
    select ls.listing_id, pr.provider_id
    from listing_source ls
    join provider_record pr on pr.id = ls.provider_record_id
    where ls.listing_id is not null
    group by ls.listing_id, pr.provider_id
    having count(*) > 1
  ),
  /*
   * One grouped pass per table rather than a subquery per record. Neither
   * \`listing_source_id\` is indexed, and correlating them across eighteen thousand records
   * turned this into a sequential scan of 1.3 million rows apiece, eighteen thousand times
   * over: it ran for eleven minutes without writing anything before it was cancelled.
   */
  weights as (
    select listing_source_id, sum(held) as rows_held
    from (
      select listing_source_id, count(*) as held from availability_slot
      where listing_source_id is not null group by listing_source_id
      union all
      select listing_source_id, count(*) from listing_price_period
      where listing_source_id is not null group by listing_source_id
    ) counted
    group by listing_source_id
  ),
  ranked as (
    select
      ls.id as source_id,
      ls.listing_id,
      row_number() over (
        partition by ls.listing_id, pr.provider_id
        order by coalesce(w.rows_held, 0) desc, ls.id
      ) as rank
    from listing_source ls
    join provider_record pr on pr.id = ls.provider_record_id
    join fused f on f.listing_id = ls.listing_id and f.provider_id = pr.provider_id
    left join weights w on w.listing_source_id = ls.id
  ),
  moving as (
    select source_id, listing_id as origin_id, rank, 'ylst_split_' || source_id as new_listing_id
    from ranked
    where rank > 1
  )
`;

/**
 * Step one: a listing of its own for every record that has to move, carrying the catalogue
 * content across.
 *
 * The content is copied rather than left to the re-projection because these listings are
 * published the moment their record points at them, and a published yacht with no photograph
 * is worse than one showing its sister's. The re-projection replaces all of it per offer
 * afterwards, from each record's own payload.
 *
 * Runs while the records still point at the listing they came from, which is the only window
 * in which the origin is knowable.
 *
 * Copy ids are derived from the pair, not from the row being copied: a listing fourteen records
 * deep sends the same extra to thirteen destinations, and keying on the source row alone made
 * all thirteen the same id.
 */
async function createSplitListings(): Promise<number> {
  const created = await db.execute<Count>(sql`
    with ${MOVING},
    created as (
      insert into listing (
        id, slug, title, operator_id, home_base_id, builder_id, model_id, category_id,
        crew_type, security_deposit_minor, security_deposit_currency,
        deposit_insurance_included, pets_allowed, default_currency, payment_policy,
        status, provider_rating, provider_review_count, freshness_at
      )
      select
        m.new_listing_id, l.slug || '-' || m.rank,
        l.title, l.operator_id, l.home_base_id, l.builder_id, l.model_id, l.category_id,
        l.crew_type, l.security_deposit_minor, l.security_deposit_currency,
        l.deposit_insurance_included, l.pets_allowed, l.default_currency, l.payment_policy,
        l.status, l.provider_rating, l.provider_review_count, l.freshness_at
      from moving m
      join listing l on l.id = m.origin_id
      on conflict (id) do nothing
      returning id
    ),
    spec as (
      insert into listing_specification (
        id, listing_id, length_m, beam_m, draft_m, year_built, cabins, berths, heads,
        showers, engines, engine_power, fuel_type, fuel_capacity, water_capacity,
        propulsion_type, steering_type, sail_type
      )
      select
        'lspec_split_' || m.source_id, m.new_listing_id,
        s.length_m, s.beam_m, s.draft_m, s.year_built, s.cabins, s.berths, s.heads,
        s.showers, s.engines, s.engine_power, s.fuel_type, s.fuel_capacity, s.water_capacity,
        s.propulsion_type, s.steering_type, s.sail_type
      from moving m
      join listing_specification s on s.listing_id = m.origin_id
      on conflict (listing_id) do nothing
      returning id
    ),
    media as (
      insert into listing_media (id, listing_id, source, external_url, role, sort_order)
      select 'lmed_split_' || m.source_id || '_' || x.id, m.new_listing_id, x.source, x.external_url, x.role, x.sort_order
      from moving m
      join listing_media x on x.listing_id = m.origin_id
      where not exists (select 1 from listing_media y where y.listing_id = m.new_listing_id)
      returning id
    ),
    texts as (
      insert into listing_text (id, listing_id, kind, locale, value)
      select 'ltxt_split_' || m.source_id || '_' || x.id, m.new_listing_id, x.kind, x.locale, x.value
      from moving m
      join listing_text x on x.listing_id = m.origin_id
      on conflict (listing_id, kind, locale) do nothing
      returning id
    ),
    amenities as (
      insert into listing_amenity (id, listing_id, amenity_id, obligatory, price_minor, price_currency)
      select 'lamn_split_' || m.source_id || '_' || x.id, m.new_listing_id, x.amenity_id, x.obligatory, x.price_minor, x.price_currency
      from moving m
      join listing_amenity x on x.listing_id = m.origin_id
      on conflict (listing_id, amenity_id) do nothing
      returning id
    ),
    checkin as (
      insert into listing_checkin_rule (id, listing_id, checkin_weekday, checkout_weekday, min_nights, max_nights)
      select 'lcir_split_' || m.source_id || '_' || x.id, m.new_listing_id, x.checkin_weekday, x.checkout_weekday, x.min_nights, x.max_nights
      from moving m
      join listing_checkin_rule x on x.listing_id = m.origin_id
      where not exists (select 1 from listing_checkin_rule y where y.listing_id = m.new_listing_id)
      returning id
    ),
    oneway as (
      insert into listing_one_way_rule (id, listing_id, start_date, end_date, is_one_way)
      select 'lowr_split_' || m.source_id || '_' || x.id, m.new_listing_id, x.start_date, x.end_date, x.is_one_way
      from moving m
      join listing_one_way_rule x on x.listing_id = m.origin_id
      where not exists (select 1 from listing_one_way_rule y where y.listing_id = m.new_listing_id)
      returning id
    ),
    extras as (
      insert into provider_extra_catalogue (
        id, listing_id, source, kind, external_id, name, obligatory, crew_role,
        price_minor, price_currency, price_measure, calculation_type, payable_in_base,
        season_start, season_end, valid_nights_from, valid_nights_to, one_way_only,
        on_request_only, external_season_id, external_base_id
      )
      select
        'pxtr_split_' || m.source_id || '_' || x.id, m.new_listing_id, x.source, x.kind, x.external_id, x.name,
        x.obligatory, x.crew_role, x.price_minor, x.price_currency, x.price_measure,
        x.calculation_type, x.payable_in_base, x.season_start, x.season_end,
        x.valid_nights_from, x.valid_nights_to, x.one_way_only, x.on_request_only,
        x.external_season_id, x.external_base_id
      from moving m
      join provider_extra_catalogue x on x.listing_id = m.origin_id
      on conflict (listing_id, source, kind, external_id) do nothing
      returning id
    )
    select count(*)::int as count from created
  `);
  return Number(created.rows[0]?.count ?? 0);
}

/**
 * Step two: the records, and the priced and dated rows they wrote, follow.
 *
 * Every one of those rows already carries the `listing_source_id` that produced it, so
 * nothing is guessed and nothing is stranded. Once this runs each record is alone on its
 * listing and `MOVING` is empty, which is what makes the pair idempotent.
 */
async function relinkSources(): Promise<number> {
  const moved = await db.execute<Count>(sql`
    with ${MOVING},
    slots as (
      update availability_slot a set listing_id = m.new_listing_id
      from moving m where a.listing_source_id = m.source_id and a.listing_id = m.origin_id
      returning a.id
    ),
    prices as (
      update listing_price_period p set listing_id = m.new_listing_id
      from moving m where p.listing_source_id = m.source_id and p.listing_id = m.origin_id
      returning p.id
    ),
    frees as (
      update listing_free_period f set listing_id = m.new_listing_id
      from moving m where f.listing_source_id = m.source_id and f.listing_id = m.origin_id
      returning f.id
    ),
    refused as (
      update listing_refused_period r set listing_id = m.new_listing_id
      from moving m where r.listing_source_id = m.source_id and r.listing_id = m.origin_id
      returning r.id
    ),
    relinked as (
      update listing_source ls set listing_id = m.new_listing_id, updated_at = now()
      from moving m where ls.id = m.source_id
      returning ls.id
    )
    select count(*)::int as count from relinked
  `);
  return Number(moved.rows[0]?.count ?? 0);
}

/* ------------------------------------------------------------------ offers */

async function createOffers(): Promise<number> {
  const created = await db.execute<{ count: number }>(sql`
    with inserted as (
      insert into listing_offer (
        id, listing_id, listing_source_id, provider_id, status,
        default_currency, payment_policy, security_deposit_minor, security_deposit_currency,
        deposit_insurance_included, crew_type, provider_rating, provider_review_count,
        title, operator_id, home_base_id, builder_id, model_id, category_id, pets_allowed,
        catalogue_synced_at
      )
      select
        'loff_' || ls.id,
        ls.listing_id,
        ls.id,
        pr.provider_id,
        case when pr.active then 'active'::offer_status else 'retired'::offer_status end,
        l.default_currency, l.payment_policy, l.security_deposit_minor,
        l.security_deposit_currency, l.deposit_insurance_included, l.crew_type,
        l.provider_rating, l.provider_review_count,
        l.title, l.operator_id, l.home_base_id, l.builder_id, l.model_id, l.category_id,
        l.pets_allowed,
        l.freshness_at
      from listing_source ls
      join provider_record pr on pr.id = ls.provider_record_id
      join listing l on l.id = ls.listing_id
      where ls.listing_id is not null
      on conflict (listing_source_id) do nothing
      returning id
    )
    select count(*)::int as count from inserted
  `);
  return Number(created.rows[0]?.count ?? 0);
}

/** Every offer's spec, copied from the listing it currently shares. */
async function createOfferSpecifications(): Promise<number> {
  const created = await db.execute<{ count: number }>(sql`
    with inserted as (
      insert into listing_offer_specification (
        id, listing_offer_id, length_m, beam_m, draft_m, year_built, cabins, berths, heads,
        showers, engines, engine_power, fuel_type, fuel_capacity, water_capacity,
        propulsion_type, steering_type, sail_type
      )
      select
        'lospec_' || o.id,
        o.id,
        s.length_m, s.beam_m, s.draft_m, s.year_built, s.cabins, s.berths, s.heads,
        s.showers, s.engines, s.engine_power, s.fuel_type, s.fuel_capacity, s.water_capacity,
        s.propulsion_type, s.steering_type, s.sail_type
      from listing_offer o
      join listing_specification s on s.listing_id = o.listing_id
      on conflict (listing_offer_id) do nothing
      returning id
    )
    select count(*)::int as count from inserted
  `);
  return Number(created.rows[0]?.count ?? 0);
}

/* ------------------------------------------------------------- attribution */

/** The four period tables, which already name the record that wrote each row. */
async function attributeBySource(table: string): Promise<number> {
  let total = 0;
  for (;;) {
    const updated = await db.execute<{ count: number }>(
      sql.raw(`
        with batch as (
          select t.id, o.id as offer_id
          from ${table} t
          join listing_offer o on o.listing_source_id = t.listing_source_id
          where t.listing_offer_id is null
          limit ${CHUNK}
        ),
        done as (
          update ${table} t set listing_offer_id = batch.offer_id
          from batch where t.id = batch.id
          returning t.id
        )
        select count(*)::int as count from done
      `),
    );
    const count = Number(updated.rows[0]?.count ?? 0);
    total += count;
    if (count === 0) break;
  }
  return total;
}

/** Media and extras, which name a provider code rather than a record. */
async function attributeByProviderCode(table: string): Promise<number> {
  let total = 0;
  for (;;) {
    const updated = await db.execute<{ count: number }>(
      sql.raw(`
        with batch as (
          select t.id, o.id as offer_id
          from ${table} t
          join listing_offer o on o.listing_id = t.listing_id
          join provider p on p.id = o.provider_id and p.code = t.source
          where t.listing_offer_id is null
          limit ${CHUNK}
        ),
        done as (
          update ${table} t set listing_offer_id = batch.offer_id
          from batch where t.id = batch.id
          returning t.id
        )
        select count(*)::int as count from done
      `),
    );
    const count = Number(updated.rows[0]?.count ?? 0);
    total += count;
    if (count === 0) break;
  }
  return total;
}

/**
 * The four tables that never carried a source: attributable only where the listing has one
 * offer, which after the split is every listing except the genuinely merged ones.
 */
async function attributeBySoleOffer(table: string): Promise<number> {
  let total = 0;
  for (;;) {
    const updated = await db.execute<{ count: number }>(
      sql.raw(`
        with sole as (
          select listing_id, min(id) as offer_id
          from listing_offer group by listing_id having count(*) = 1
        ),
        batch as (
          select t.id, sole.offer_id
          from ${table} t
          join sole on sole.listing_id = t.listing_id
          where t.listing_offer_id is null
          limit ${CHUNK}
        ),
        done as (
          update ${table} t set listing_offer_id = batch.offer_id
          from batch where t.id = batch.id
          returning t.id
        )
        select count(*)::int as count from done
      `),
    );
    const count = Number(updated.rows[0]?.count ?? 0);
    total += count;
    if (count === 0) break;
  }
  return total;
}

/**
 * Quotes and bookings resolve through the vendor they were sold with. A row whose offer no
 * longer exists keeps a null and its own `provider` column, which is the truth for it: that
 * is the vendor holding the reservation whatever our catalogue says now.
 */
async function attributeCommerce(table: string): Promise<number> {
  const updated = await db.execute<{ count: number }>(
    sql.raw(`
      with batch as (
        select t.id, o.id as offer_id
        from ${table} t
        join listing_offer o on o.listing_id = t.listing_id
        join provider p on p.id = o.provider_id and p.code = t.provider
        where t.listing_offer_id is null
      ),
      done as (
        update ${table} t set listing_offer_id = batch.offer_id
        from batch where t.id = batch.id
        returning t.id
      )
      select count(*)::int as count from done
    `),
  );
  return Number(updated.rows[0]?.count ?? 0);
}

/* -------------------------------------------------------------------- main */

async function main(): Promise<void> {
  console.log(apply ? "Backfilling listing offers.\n" : "Dry run. Pass --apply to write.\n");
  await report();

  if (!apply) {
    console.log("\nNothing written.");
    return;
  }

  console.log("\nSplitting fused listings...");
  console.log(`  ${await createSplitListings()} listings created`);
  console.log(`  ${await relinkSources()} records moved onto them`);

  console.log("Creating offers...");
  console.log(`  ${await createOffers()} offers`);
  console.log(`  ${await createOfferSpecifications()} offer specifications`);

  console.log("Attributing child rows...");
  for (const table of [
    "availability_slot",
    "listing_price_period",
    "listing_free_period",
    "listing_refused_period",
  ]) {
    console.log(`  ${table}: ${await attributeBySource(table)}`);
  }
  for (const table of ["listing_media", "provider_extra_catalogue"]) {
    console.log(`  ${table}: ${await attributeByProviderCode(table)}`);
  }
  for (const table of [
    "listing_text",
    "listing_amenity",
    "listing_checkin_rule",
    "listing_one_way_rule",
  ]) {
    console.log(`  ${table}: ${await attributeBySoleOffer(table)}`);
  }
  for (const table of ["quote", "booking"]) {
    console.log(`  ${table}: ${await attributeCommerce(table)}`);
  }

  console.log("\nRows still unattributed:");
  for (const table of [
    "availability_slot",
    "listing_price_period",
    "listing_free_period",
    "listing_refused_period",
    "listing_media",
    "provider_extra_catalogue",
    "listing_text",
    "listing_amenity",
    "listing_checkin_rule",
    "listing_one_way_rule",
  ]) {
    const left = await scalar(
      sql.raw(`select count(*)::int as count from ${table} where listing_offer_id is null`),
    );
    if (left > 0) console.log(`  ${table}: ${left}`);
  }

  console.log("\nDone. Run offers:verify next.");
}

/* A catch binding rather than a handler parameter, so nothing has to accept an `unknown`. */
try {
  await main();
  process.exit(0);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
