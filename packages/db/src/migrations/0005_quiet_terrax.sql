DROP INDEX "listing_search_doc_price_cursor_idx";--> statement-breakpoint
DROP INDEX "listing_search_doc_year_cursor_idx";--> statement-breakpoint
CREATE INDEX "listing_search_doc_price_desc_cursor_idx" ON "listing_search_doc" USING btree (coalesce("price_from_minor", -1) desc,"listing_id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "listing_search_doc_price_cursor_idx" ON "listing_search_doc" USING btree (coalesce("price_from_minor", 2147483647),"listing_id");--> statement-breakpoint
CREATE INDEX "listing_search_doc_year_cursor_idx" ON "listing_search_doc" USING btree (coalesce("year_built", 0) desc,"listing_id" DESC NULLS LAST);