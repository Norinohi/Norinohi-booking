-- Moves Booking Manager's geography from world regions to sailing areas, in place.
--
-- The projection used to name every Booking Manager region after the vendor's world region, so
-- Croatia, Greece and Italy each carried a "Southern Europe" region holding all their sailing
-- areas as locations. It now names the region after the sailing area, the same as the location.
-- Left to the sync, that change would insert new regions, new locations and new bases, and move
-- the listings onto them: every suggested route attached to an old base (31 of them on the
-- local catalogue) would stop matching its boats without anyone noticing.
--
-- So each location under a world region moves to a region of its own name in the same country,
-- created where none exists and shared where one does (a NauSYS "Cyclades" region takes the
-- Booking Manager "Cyclades" location). Location and base ids do not change, and the next sync
-- finds every row where the projection now puts it.
--
-- The world region names are the vendor's own list (its `/regions`), which no NauSYS region
-- shares. A location that is its region's namesake stays where it is, since the projection lands
-- it there anyway, and so does one whose destination already holds a location of that name,
-- which means a sync with the new projection got there first. Emptied world regions are left in
-- place: a route may be attached to one, and nothing lists a region without bases.

with world_region as (
  select r.id, r.country_id
  from region r
  where r.name in (
    'Antarctic', 'Australia and New Zealand', 'Caribbean', 'Central America', 'Eastern Africa',
    'Eastern Asia', 'Eastern Europe', 'Melanesia', 'Micronesia', 'Middle Africa',
    'Northern Africa', 'Northern America', 'Northern Europe', 'Polynesia', 'South America',
    'South-central Asia', 'South-eastern Asia', 'Southern Africa', 'Southern Europe',
    'Western Africa', 'Western Asia', 'Western Europe'
  )
),
moving as (
  select l.id as location_id, l.name, w.country_id
  from location l
  join world_region w on w.id = l.region_id
  join region current_region on current_region.id = l.region_id
  where l.name <> current_region.name
),
created as (
  insert into region (id, country_id, name)
  select distinct
    'rgn_sa_' || substr(md5(m.country_id || ':' || m.name), 1, 21),
    m.country_id,
    m.name
  from moving m
  on conflict (country_id, name) do nothing
  returning id, country_id, name
),
destination as (
  select id, country_id, name from created
  union all
  select r.id, r.country_id, r.name
  from region r
  join (select distinct country_id, name from moving) m
    on m.country_id = r.country_id and m.name = r.name
)
update location l
set region_id = d.id, updated_at = now()
from moving m
join destination d on d.country_id = m.country_id and d.name = m.name
where l.id = m.location_id
  and not exists (
    select 1 from location taken where taken.region_id = d.id and taken.name = m.name
  );
