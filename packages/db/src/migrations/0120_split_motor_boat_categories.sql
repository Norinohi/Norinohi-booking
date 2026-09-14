-- Moves motor boats and power catamarans out of "Motor yacht" and "Catamaran" into categories of
-- their own, following `packages/providers/src/shared/category-groups.ts`.
--
-- The catalogue sync would get there on its own, but only for the category rows: the search
-- document denormalises the category, so until every affected listing is rebuilt the facet and
-- the popular-yachts mix would keep reading the old group. Both are updated here for that reason.

update yacht_category set canonical_name = v.canonical from (values
  ('nausys:112727', 'Motor catamaran'),
  ('booking_manager:power-catamaran', 'Motor catamaran'),
  ('nausys:120895', 'Motor boat'),
  ('nausys:1163407', 'Motor boat'),
  ('booking_manager:motor-boat', 'Motor boat')
) as v(code, canonical) where yacht_category.code = v.code and yacht_category.canonical_name is distinct from v.canonical;
--> statement-breakpoint
update listing_search_doc doc set category = coalesce(cat.canonical_name, cat.name)
from listing l
join yacht_category cat on cat.id = l.category_id
where l.id = doc.listing_id
  and cat.code in (
    'nausys:112727',
    'booking_manager:power-catamaran',
    'nausys:120895',
    'nausys:1163407',
    'booking_manager:motor-boat'
  )
  and doc.category is distinct from coalesce(cat.canonical_name, cat.name);
