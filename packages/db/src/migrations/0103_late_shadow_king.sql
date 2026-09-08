ALTER TABLE "listing_search_doc" ADD COLUMN "base_price_from_minor" integer;--> statement-breakpoint
ALTER TABLE "listing_search_doc" ADD COLUMN "base_price_from_minor_eur" integer;--> statement-breakpoint
CREATE INDEX "listing_search_doc_base_price_eur_idx" ON "listing_search_doc" USING btree ("base_price_from_minor_eur");--> statement-breakpoint
CREATE INDEX "listing_search_doc_base_price_cursor_idx" ON "listing_search_doc" USING btree (coalesce("base_price_from_minor_eur", 2147483647),"listing_id");--> statement-breakpoint
CREATE INDEX "listing_search_doc_base_price_desc_cursor_idx" ON "listing_search_doc" USING btree (coalesce("base_price_from_minor_eur", -1) desc,"listing_id" DESC NULLS LAST);