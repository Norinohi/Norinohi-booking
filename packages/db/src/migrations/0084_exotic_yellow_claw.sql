ALTER TABLE "listing" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "listing_offer" ADD COLUMN "name" text;--> statement-breakpoint
/*
 * Backfill, so 18k existing rows carry a name before the next catalogue sync rewrites them.
 *
 * The title was built as `name + ' ' + model`, so removing a trailing model recovers the name.
 * Only a trailing match with its separating space counts: "Salona 45 Performance" must keep the
 * "Salona 45" it starts with, and a title that IS the model ("Sole") has no name to strip and
 * keeps the whole string. Rows whose model is unknown keep the title verbatim, which is the
 * same thing the projection would emit for a boat whose model never resolved.
 */
UPDATE "listing" l
SET "name" = CASE
  WHEN m."name" IS NOT NULL
   AND m."name" <> ''
   AND l."title" <> m."name"
   AND l."title" LIKE '% ' || m."name"
  THEN btrim(left(l."title", length(l."title") - length(m."name") - 1))
  ELSE l."title"
END
FROM "yacht_model" m
WHERE m."id" = l."model_id" AND l."name" IS NULL;
--> statement-breakpoint
UPDATE "listing" SET "name" = "title" WHERE "name" IS NULL;
--> statement-breakpoint
UPDATE "listing_offer" o
SET "name" = CASE
  WHEN m."name" IS NOT NULL
   AND m."name" <> ''
   AND o."title" <> m."name"
   AND o."title" LIKE '% ' || m."name"
  THEN btrim(left(o."title", length(o."title") - length(m."name") - 1))
  ELSE o."title"
END
FROM "yacht_model" m
WHERE m."id" = o."model_id" AND o."name" IS NULL AND o."title" IS NOT NULL;
--> statement-breakpoint
UPDATE "listing_offer" SET "name" = "title" WHERE "name" IS NULL AND "title" IS NOT NULL;
