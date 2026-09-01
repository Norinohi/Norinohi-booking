ALTER TABLE "listing_search_doc" ADD COLUMN "name" text;--> statement-breakpoint
/* Keep the read model in step without waiting for the next full rebuild. */
UPDATE "listing_search_doc" d SET "name" = l."name" FROM "listing" l WHERE l."id" = d."listing_id";
