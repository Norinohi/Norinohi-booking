-- Seeds `yacht_category.canonical_name` for the vendor categories imported so far.
--
-- The map itself lives in `packages/providers/src/shared/category-groups.ts` and the catalogue
-- sync applies it on every upsert, so a fleet that has synced since that file gained its
-- Booking Manager rows already has these values. This backfills the ones imported before it,
-- which would otherwise wait for the next full sync: until then "Motoryacht" (414 boats) sits
-- beside "Motor yacht" (264) as its own search facet, same copy, same photo.
--
-- Data, not schema, and deliberately not a rule: only a person knows that Booking Manager's
-- "Motoryacht" and NauSYS's "Motor yacht" are one category, or that a three-boat "Cruiser"
-- category holds hulls all titled "... Motoryacht". Generated from the TypeScript map so the
-- two cannot disagree.
--
-- Unlike `0051_seed_builder_brands.sql`, this overwrites rather than filling only nulls: the
-- catalogue sync writes `yacht_category.canonical_name` on every upsert, so a hand edit here
-- would not survive the next import anyway. The map is the source of truth for this column.
--
-- Note this does NOT update `listing_search_doc`, which denormalises the category through
-- `coalesce(cat.canonical_name, cat.name)`. Follow this with `pnpm --filter server
-- rebuild:search-docs`, or let the next catalogue sync rebuild the affected listings.

update yacht_category set canonical_name = v.canonical from (values
  ('nausys:51', 'Catamaran'),
  ('nausys:4942740', 'Catamaran'),
  ('nausys:112727', 'Catamaran'),
  ('nausys:1', 'Sailing yacht'),
  ('nausys:625371', 'Sailing yacht'),
  ('nausys:1505715', 'Sailing yacht'),
  ('nausys:101', 'Motor yacht'),
  ('nausys:120895', 'Motor yacht'),
  ('nausys:828326', 'Motor yacht'),
  ('nausys:1163407', 'Motor yacht'),
  ('nausys:126977', 'Motorsailer'),
  ('nausys:565915', 'Motorsailer'),
  ('nausys:12798239', 'Motorsailer'),
  ('nausys:115791', 'Motorsailer'),
  ('nausys:43242759', 'House boat'),
  ('nausys:17355539', 'House boat'),
  ('nausys:102', 'Gulet'),
  ('nausys:841932', 'Trimaran'),
  ('nausys:100460', 'Jet Ski'),
  ('booking_manager:catamaran', 'Catamaran'),
  ('booking_manager:power-catamaran', 'Catamaran'),
  ('booking_manager:sail-boat', 'Sailing yacht'),
  ('booking_manager:wooden-boat', 'Sailing yacht'),
  ('booking_manager:motoryacht', 'Motor yacht'),
  ('booking_manager:motor-boat', 'Motor yacht'),
  ('booking_manager:motor-cruiser', 'Motor yacht'),
  ('booking_manager:cruiser', 'Motor yacht'),
  ('booking_manager:motorsailer', 'Motorsailer'),
  ('booking_manager:rubber-boat', 'Motorsailer'),
  ('booking_manager:houseboat', 'House boat'),
  ('booking_manager:gulet', 'Gulet'),
  ('booking_manager:trimaran', 'Trimaran')
) as v(code, canonical) where yacht_category.code = v.code and yacht_category.canonical_name is distinct from v.canonical;
