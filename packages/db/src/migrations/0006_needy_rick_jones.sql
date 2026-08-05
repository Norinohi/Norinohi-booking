ALTER TABLE "availability_slot" ADD COLUMN "availability_confirmed" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "listing" ADD COLUMN "crew_type" text;--> statement-breakpoint
ALTER TABLE "listing" ADD COLUMN "deposit_insurance_included" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "listing" ADD COLUMN "pets_allowed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "listing_search_doc" ADD COLUMN "crew_type" text;--> statement-breakpoint
ALTER TABLE "listing_search_doc" ADD COLUMN "sail_type" text;--> statement-breakpoint
ALTER TABLE "listing_search_doc" ADD COLUMN "deposit_insurance_included" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "listing_search_doc" ADD COLUMN "pets_allowed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "listing_search_doc" ADD COLUMN "has_unconfirmed_availability" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "listing_search_doc" ADD COLUMN "has_temporary_booking" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "listing_search_doc_crew_idx" ON "listing_search_doc" USING btree ("crew_type");--> statement-breakpoint
CREATE INDEX "listing_search_doc_sail_type_idx" ON "listing_search_doc" USING btree ("sail_type");--> statement-breakpoint
CREATE INDEX "listing_search_doc_deposit_insurance_idx" ON "listing_search_doc" USING btree ("deposit_insurance_included");--> statement-breakpoint
CREATE INDEX "listing_search_doc_pets_idx" ON "listing_search_doc" USING btree ("pets_allowed");--> statement-breakpoint
CREATE INDEX "listing_search_doc_availability_state_idx" ON "listing_search_doc" USING btree ("has_unconfirmed_availability","has_temporary_booking");