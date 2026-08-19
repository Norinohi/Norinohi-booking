ALTER TABLE "location" ADD COLUMN "city" text;--> statement-breakpoint
ALTER TABLE "yacht_model" ADD COLUMN "canonical_name" text;--> statement-breakpoint
ALTER TABLE "listing_search_doc" ADD COLUMN "model_canonical" text;--> statement-breakpoint
ALTER TABLE "listing_search_doc" ADD COLUMN "city" text;--> statement-breakpoint
CREATE INDEX "location_city_idx" ON "location" USING btree ("city");--> statement-breakpoint
CREATE INDEX "yacht_model_canonical_name_idx" ON "yacht_model" USING btree ("canonical_name");--> statement-breakpoint
CREATE INDEX "listing_search_doc_city_idx" ON "listing_search_doc" USING btree ("city");--> statement-breakpoint
CREATE INDEX "listing_search_doc_model_canonical_idx" ON "listing_search_doc" USING btree ("model_canonical");