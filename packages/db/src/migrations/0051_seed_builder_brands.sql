-- Seeds `builder.canonical_name` for the vendor builder names the catalogue has imported so far.
--
-- Data, not schema: providers file the legal entity, and only a person knows that Cantiere del
-- Pardo builds Grand Soleil or that "Lagoon-Bénéteau" and "Lagoon" are one brand. No rule derives
-- it — stripping "Boats" off "AD Boats" would invent a builder that does not exist. Filled once
-- here, edited in place afterwards; the sync never writes this column, so an edit survives every
-- later import.
--
-- Left split on purpose: "Azimut / Benetti Yachts" builds both marques, so folding it onto either
-- one would file boats under a brand that did not build them.
--
-- Matched case-insensitively on the vendor name, and only where the column is still unset, so
-- re-running this can never overwrite a correction somebody made by hand.

update "builder" set "canonical_name" = v.brand
from (values
  ('bavaria yachtbau', 'Bavaria'),
  ('beneteau', 'Bénéteau'),
  ('lagoon-bénéteau', 'Lagoon'),
  ('dufour yachts', 'Dufour'),
  ('catana group', 'Catana'),
  ('leopard catamarans / robertson & caine', 'Leopard'),
  ('nautitech rochefort', 'Nautitech'),
  ('catamarans nautitech', 'Nautitech'),
  ('elan marine', 'Elan'),
  ('hanse yachts', 'Hanse'),
  ('azimut yachts', 'Azimut'),
  ('sunseeker international', 'Sunseeker'),
  ('cantiere del pardo (grand soleil)', 'Grand Soleil')
) as v(name, brand)
where lower("builder"."name") = v.name and "builder"."canonical_name" is null;
