-- Binds each provider base id to the base row its boats already stand on.
--
-- The catalogue writer used to find a base by location and name, so it kept no record of which
-- row a provider's base became. It now finds a bound base by the provider's own id and moves the
-- row in place when the placement changes. Without this backfill the first sync after the change
-- would still look the old way for every base, and a base whose placement had drifted meanwhile
-- would be forked one last time.
--
-- The row is read off the offers: where one provider base already forked into two rows, the one
-- carrying more of its boats wins, and the other is left to the writer's old lookup. Bases no
-- boat stands on are bound by the next sync.

insert into base_source (id, provider_id, external_id, base_id)
select
  'bsrc_' || substr(md5(ranked.provider_id || ':' || ranked.external_base_id), 1, 21),
  ranked.provider_id,
  ranked.external_base_id,
  ranked.base_id
from (
  select
    o.provider_id,
    s.external_base_id,
    o.home_base_id as base_id,
    row_number() over (
      partition by o.provider_id, s.external_base_id
      order by count(*) desc, o.home_base_id
    ) as rank
  from listing_offer o
  join listing_source s on s.id = o.listing_source_id
  where o.home_base_id is not null and s.external_base_id is not null
  group by o.provider_id, s.external_base_id, o.home_base_id
) ranked
where ranked.rank = 1
on conflict (provider_id, external_id) do nothing;
