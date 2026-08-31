ALTER TABLE "listing_search_doc" ADD COLUMN "best_offer_id" text;--> statement-breakpoint
ALTER TABLE "listing_search_doc" ADD COLUMN "offer_count" integer DEFAULT 0 NOT NULL;