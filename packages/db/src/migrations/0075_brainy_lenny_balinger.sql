ALTER TABLE "availability_slot" DROP CONSTRAINT "availability_slot_period_uq";--> statement-breakpoint
ALTER TABLE "listing_free_period" DROP CONSTRAINT "listing_free_period_uq";--> statement-breakpoint
ALTER TABLE "listing_price_period" DROP CONSTRAINT "listing_price_period_uq";--> statement-breakpoint
ALTER TABLE "listing_refused_period" DROP CONSTRAINT "listing_refused_period_uq";--> statement-breakpoint
ALTER TABLE "listing_amenity" DROP CONSTRAINT "listing_amenity_uq";--> statement-breakpoint
ALTER TABLE "provider_extra_catalogue" DROP CONSTRAINT "provider_extra_catalogue_uq";--> statement-breakpoint
ALTER TABLE "listing_text" DROP CONSTRAINT "listing_text_locale_uq";--> statement-breakpoint
ALTER TABLE "availability_slot" ALTER COLUMN "listing_offer_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "listing_free_period" ALTER COLUMN "listing_offer_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "listing_price_period" ALTER COLUMN "listing_offer_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "listing_refused_period" ALTER COLUMN "listing_offer_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "listing_amenity" ALTER COLUMN "listing_offer_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "listing_checkin_rule" ALTER COLUMN "listing_offer_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "listing_media" ALTER COLUMN "listing_offer_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "listing_one_way_rule" ALTER COLUMN "listing_offer_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "provider_extra_catalogue" ALTER COLUMN "listing_offer_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "listing_text" ALTER COLUMN "listing_offer_id" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "listing_checkin_rule_offer_idx" ON "listing_checkin_rule" USING btree ("listing_offer_id");--> statement-breakpoint
CREATE INDEX "listing_media_offer_idx" ON "listing_media" USING btree ("listing_offer_id");--> statement-breakpoint
CREATE INDEX "listing_one_way_rule_offer_idx" ON "listing_one_way_rule" USING btree ("listing_offer_id");--> statement-breakpoint
ALTER TABLE "availability_slot" ADD CONSTRAINT "availability_slot_period_uq" UNIQUE("listing_offer_id","start_date","end_date");--> statement-breakpoint
ALTER TABLE "listing_free_period" ADD CONSTRAINT "listing_free_period_uq" UNIQUE("listing_offer_id","start_date","end_date");--> statement-breakpoint
ALTER TABLE "listing_price_period" ADD CONSTRAINT "listing_price_period_uq" UNIQUE("listing_offer_id","kind","start_date","end_date");--> statement-breakpoint
ALTER TABLE "listing_refused_period" ADD CONSTRAINT "listing_refused_period_uq" UNIQUE("listing_offer_id","start_date","end_date");--> statement-breakpoint
ALTER TABLE "listing_amenity" ADD CONSTRAINT "listing_amenity_uq" UNIQUE("listing_offer_id","amenity_id");--> statement-breakpoint
ALTER TABLE "provider_extra_catalogue" ADD CONSTRAINT "provider_extra_catalogue_uq" UNIQUE("listing_offer_id","kind","external_id");--> statement-breakpoint
ALTER TABLE "listing_text" ADD CONSTRAINT "listing_text_locale_uq" UNIQUE("listing_offer_id","kind","locale");