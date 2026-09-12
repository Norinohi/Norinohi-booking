DROP INDEX "listing_search_doc_availability_state_idx";--> statement-breakpoint
CREATE INDEX "availability_slot_option_idx" ON "availability_slot" USING btree ("listing_id","start_date","end_date") WHERE status = 'option';--> statement-breakpoint
ALTER TABLE "listing_search_doc" DROP COLUMN "has_unconfirmed_availability";--> statement-breakpoint
ALTER TABLE "listing_search_doc" DROP COLUMN "has_temporary_booking";