-- Seeds `location.city` for the vendor locations the catalogue has imported so far.
--
-- Data, not schema: no provider models a town, so this column is curated. It is filled once here
-- so the geography works from the first deploy, and edited in place afterwards — nothing in the
-- sync writes it (locations are inserted with ON CONFLICT DO NOTHING), so an edit survives every
-- later import.
--
-- Matched on the location name rather than a vendor id because `location` keeps no external id.
-- Only rows whose city is still unset are touched, so re-running this can never overwrite a
-- correction somebody made by hand.

update "location" set "city" = v.city
from (values
  ('ACI Marina Pula', 'Pula'),
  ('ACI Marina Rovinj', 'Rovinj'),
  ('Marina Kastela', 'Kaštela'),
  ('ACI Marina Trogir', 'Trogir'),
  ('Trogir', 'Trogir'),
  ('Dubrovnik, Komolac, ACI Marina Dubrovnik', 'Dubrovnik'),
  ('Marina Zadar (ex. Tankerkomerc)', 'Zadar'),
  ('ACI Marina Cres', 'Cres'),
  ('Marina Losinj, Mali Losinj', 'Mali Lošinj'),
  ('Šibenik, Marina Zaton', 'Šibenik'),
  ('ACI marina Palmižana', 'Hvar'),
  ('Lavrion, main port', 'Lavrio'),
  ('Lefkas, D-Marin', 'Lefkada'),
  ('Marmaris, Netsel Marina', 'Marmaris'),
  ('Göcek/D-Marin', 'Göcek'),
  ('Setur Göcek Village Port', 'Göcek'),
  ('Marina D''Arechi', 'Salerno'),
  ('Cote D''Azur, Marseille Marina Vieux Port', 'Marseille'),
  ('Corsica, Ajaccio, Port De Plaisance Charles Ornano', 'Ajaccio'),
  ('Tenerife, San Miguel Marina', 'San Miguel de Abona'),
  ('Grenada, Port Louis Marina', 'St. George''s'),
  ('St. Martin, Marina de L''Anse Marcel', 'Anse Marcel'),
  ('Nassau, Palm Cay Marina', 'Nassau'),
  ('Antigua, Jolly Harbour Marina', 'Jolly Harbour'),
  ('BVI, Scrub Island Marina', 'Scrub Island'),
  ('Florida Keys, Key West Stock Island Yacht club', 'Key West')
) as v(name, city)
where "location"."name" = v.name and "location"."city" is null;
