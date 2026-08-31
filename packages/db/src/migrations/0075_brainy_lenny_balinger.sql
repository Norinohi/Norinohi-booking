-- Backfill, then tighten. The DML below is normally the job of
-- `packages/providers/src/scripts/backfill-listing-offers.ts`, and it lives here because
-- production has nowhere else to run it: the pre-deploy step is `node dist/migrate.mjs` and
-- nothing more, so a migration that assumes a script ran first can never succeed there.
-- It failed exactly that way once, on the first SET NOT NULL below.
--
-- Everything here is idempotent and guarded on `listing_offer_id is null`, so re-running it
-- after a rolled-back deploy is a no-op. Ids are derived, never minted, for the same reason.
--
-- Split the listings the old matcher fused. `decideListingMatch` used to attach a new record
-- to an existing listing when company|base|model|year|name agreed, and Booking Manager
-- publishes no per-hull name, so that tuple was identical across a whole fleet at one base.
-- Prices and calendars were keyed by listing, so every record after the first was overwritten
-- into invisibility. One record keeps the original listing and its URL: the one holding the
-- most priced and dated rows, so the survivor is the one with a calendar behind it.
--
-- Content is copied rather than left to the next sync because these listings go live the
-- moment a record points at them, and a published yacht with no photograph is worse than one
-- showing its sister's. The next catalogue sync replaces all of it per offer.
with fused as (
  select ls.listing_id, pr.provider_id
  from listing_source ls
  join provider_record pr on pr.id = ls.provider_record_id
  where ls.listing_id is not null
  group by ls.listing_id, pr.provider_id
  having count(*) > 1
),
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
),
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
select count(*) from created;--> statement-breakpoint
-- The records, and the priced and dated rows they wrote, follow onto the new listings. Every
-- one of those rows already names the record that produced it, so nothing is guessed. Once
-- this runs each record is alone on its listing and `moving` is empty, which is what makes
-- the pair re-runnable.
with fused as (
  select ls.listing_id, pr.provider_id
  from listing_source ls
  join provider_record pr on pr.id = ls.provider_record_id
  where ls.listing_id is not null
  group by ls.listing_id, pr.provider_id
  having count(*) > 1
),
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
),
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
select count(*) from relinked;--> statement-breakpoint
-- One offer per attached record. The commercial columns are copied off the listing as a
-- placeholder until the next catalogue sync writes each vendor's own, which matters on a
-- merged listing where the stored values are whichever provider synced last.
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
on conflict (listing_source_id) do nothing;--> statement-breakpoint
insert into listing_offer_specification (
  id, listing_offer_id, length_m, beam_m, draft_m, year_built, cabins, berths, heads,
  showers, engines, engine_power, fuel_type, fuel_capacity, water_capacity,
  propulsion_type, steering_type, sail_type
)
select
  'lospec_' || o.id, o.id,
  s.length_m, s.beam_m, s.draft_m, s.year_built, s.cabins, s.berths, s.heads,
  s.showers, s.engines, s.engine_power, s.fuel_type, s.fuel_capacity, s.water_capacity,
  s.propulsion_type, s.steering_type, s.sail_type
from listing_offer o
join listing_specification s on s.listing_id = o.listing_id
on conflict (listing_offer_id) do nothing;--> statement-breakpoint
-- The four period tables already name the record that wrote each row.
update availability_slot t set listing_offer_id = o.id
from listing_offer o where o.listing_source_id = t.listing_source_id and t.listing_offer_id is null;--> statement-breakpoint
update listing_price_period t set listing_offer_id = o.id
from listing_offer o where o.listing_source_id = t.listing_source_id and t.listing_offer_id is null;--> statement-breakpoint
update listing_free_period t set listing_offer_id = o.id
from listing_offer o where o.listing_source_id = t.listing_source_id and t.listing_offer_id is null;--> statement-breakpoint
update listing_refused_period t set listing_offer_id = o.id
from listing_offer o where o.listing_source_id = t.listing_source_id and t.listing_offer_id is null;--> statement-breakpoint
-- Media and extras name a provider code rather than a record.
update listing_media t set listing_offer_id = o.id
from listing_offer o join provider p on p.id = o.provider_id
where o.listing_id = t.listing_id and p.code = t.source and t.listing_offer_id is null;--> statement-breakpoint
update provider_extra_catalogue t set listing_offer_id = o.id
from listing_offer o join provider p on p.id = o.provider_id
where o.listing_id = t.listing_id and p.code = t.source and t.listing_offer_id is null;--> statement-breakpoint
-- The four tables that never carried a source are attributable only where the listing has a
-- single offer, which after the split above is every listing except the genuinely merged ones.
update listing_text t set listing_offer_id = sole.offer_id
from (select listing_id, min(id) as offer_id from listing_offer group by listing_id having count(*) = 1) sole
where sole.listing_id = t.listing_id and t.listing_offer_id is null;--> statement-breakpoint
update listing_amenity t set listing_offer_id = sole.offer_id
from (select listing_id, min(id) as offer_id from listing_offer group by listing_id having count(*) = 1) sole
where sole.listing_id = t.listing_id and t.listing_offer_id is null;--> statement-breakpoint
update listing_checkin_rule t set listing_offer_id = sole.offer_id
from (select listing_id, min(id) as offer_id from listing_offer group by listing_id having count(*) = 1) sole
where sole.listing_id = t.listing_id and t.listing_offer_id is null;--> statement-breakpoint
update listing_one_way_rule t set listing_offer_id = sole.offer_id
from (select listing_id, min(id) as offer_id from listing_offer group by listing_id having count(*) = 1) sole
where sole.listing_id = t.listing_id and t.listing_offer_id is null;--> statement-breakpoint
-- Quotes and bookings resolve through the vendor they were sold with. A row whose offer is
-- gone keeps a null and its own `provider` column, which is the truth for it: that is the
-- vendor holding the reservation whatever the catalogue says now. Neither becomes NOT NULL.
update quote t set listing_offer_id = o.id
from listing_offer o join provider p on p.id = o.provider_id
where o.listing_id = t.listing_id and p.code = t.provider and t.listing_offer_id is null;--> statement-breakpoint
update booking t set listing_offer_id = o.id
from listing_offer o join provider p on p.id = o.provider_id
where o.listing_id = t.listing_id and p.code = t.provider and t.listing_offer_id is null;--> statement-breakpoint
-- What is left cannot be attributed to any vendor and cannot be kept, because the columns go
-- NOT NULL next. On a genuinely merged listing these rows are whichever provider synced last,
-- so keeping them would put one vendor's words in the other's mouth; elsewhere they belong to
-- a record no longer attached to anything. Every one of these tables is a projection of a
-- provider feed, rebuilt per offer by the next catalogue, availability or price sync.
delete from availability_slot where listing_offer_id is null;--> statement-breakpoint
delete from listing_price_period where listing_offer_id is null;--> statement-breakpoint
delete from listing_free_period where listing_offer_id is null;--> statement-breakpoint
delete from listing_refused_period where listing_offer_id is null;--> statement-breakpoint
delete from listing_media where listing_offer_id is null;--> statement-breakpoint
delete from provider_extra_catalogue where listing_offer_id is null;--> statement-breakpoint
delete from listing_text where listing_offer_id is null;--> statement-breakpoint
delete from listing_amenity where listing_offer_id is null;--> statement-breakpoint
delete from listing_checkin_rule where listing_offer_id is null;--> statement-breakpoint
delete from listing_one_way_rule where listing_offer_id is null;--> statement-breakpoint
ALTER TABLE "availability_slot" DROP CONSTRAINT "availability_slot_period_uq";--> statement-breakpoint
ALTER TABLE "listing_free_period" DROP CONSTRAINT "listing_free_period_uq";--> statement-breakpoint
ALTER TABLE "listing_price_period" DROP CONSTRAINT "listing_price_period_uq";--> statement-breakpoint
ALTER TABLE "listing_refused_period" DROP CONSTRAINT "listing_refused_period_uq";--> statement-breakpoint
ALTER TABLE "listing_amenity" DROP CONSTRAINT "listing_amenity_uq";--> statement-breakpoint
ALTER TABLE "provider_extra_catalogue" DROP CONSTRAINT "provider_extra_catalogue_uq";--> statement-breakpoint
ALTER TABLE "listing_text" DROP CONSTRAINT "listing_text_locale_uq";--> statement-breakpoint
ALTER TABLE "availability_slot" ALTER COLUMN "listing_offer_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "listing_free_period" ALTER COLUMN "listing_offer_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "listing_price_period" ALTER COLUMN "listing_offer_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "listing_refused_period" ALTER COLUMN "listing_offer_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "listing_amenity" ALTER COLUMN "listing_offer_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "listing_checkin_rule" ALTER COLUMN "listing_offer_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "listing_media" ALTER COLUMN "listing_offer_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "listing_one_way_rule" ALTER COLUMN "listing_offer_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "provider_extra_catalogue" ALTER COLUMN "listing_offer_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "listing_text" ALTER COLUMN "listing_offer_id" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "listing_checkin_rule_offer_idx" ON "listing_checkin_rule" USING btree ("listing_offer_id");--> statement-breakpoint
CREATE INDEX "listing_media_offer_idx" ON "listing_media" USING btree ("listing_offer_id");--> statement-breakpoint
CREATE INDEX "listing_one_way_rule_offer_idx" ON "listing_one_way_rule" USING btree ("listing_offer_id");--> statement-breakpoint
ALTER TABLE "availability_slot" ADD CONSTRAINT "availability_slot_period_uq" UNIQUE("listing_offer_id","start_date","end_date");--> statement-breakpoint
ALTER TABLE "listing_free_period" ADD CONSTRAINT "listing_free_period_uq" UNIQUE("listing_offer_id","start_date","end_date");--> statement-breakpoint
ALTER TABLE "listing_price_period" ADD CONSTRAINT "listing_price_period_uq" UNIQUE("listing_offer_id","kind","start_date","end_date");--> statement-breakpoint
ALTER TABLE "listing_refused_period" ADD CONSTRAINT "listing_refused_period_uq" UNIQUE("listing_offer_id","start_date","end_date");--> statement-breakpoint
ALTER TABLE "listing_amenity" ADD CONSTRAINT "listing_amenity_uq" UNIQUE("listing_offer_id","amenity_id");--> statement-breakpoint
ALTER TABLE "provider_extra_catalogue" ADD CONSTRAINT "provider_extra_catalogue_uq" UNIQUE("listing_offer_id","kind","external_id");--> statement-breakpoint
ALTER TABLE "listing_text" ADD CONSTRAINT "listing_text_locale_uq" UNIQUE("listing_offer_id","kind","locale");
