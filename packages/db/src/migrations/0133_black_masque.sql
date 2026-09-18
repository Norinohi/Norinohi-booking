ALTER TABLE "listing_price_period" DROP CONSTRAINT "listing_price_period_uq";--> statement-breakpoint
ALTER TABLE "listing_amenity" DROP CONSTRAINT "listing_amenity_uq";--> statement-breakpoint
ALTER TABLE "provider_extra_catalogue" DROP CONSTRAINT "provider_extra_catalogue_uq";--> statement-breakpoint
ALTER TABLE "listing_price_period" DROP COLUMN "id";--> statement-breakpoint
ALTER TABLE "listing_amenity" DROP COLUMN "id";--> statement-breakpoint
ALTER TABLE "provider_extra_catalogue" DROP COLUMN "id";--> statement-breakpoint
ALTER TABLE "listing_price_period" ADD CONSTRAINT "listing_price_period_pkey" PRIMARY KEY("listing_offer_id","kind","start_date","end_date");--> statement-breakpoint
ALTER TABLE "listing_amenity" ADD CONSTRAINT "listing_amenity_pkey" PRIMARY KEY("listing_offer_id","amenity_id");--> statement-breakpoint
ALTER TABLE "provider_extra_catalogue" ADD CONSTRAINT "provider_extra_catalogue_pkey" PRIMARY KEY("listing_offer_id","kind","external_id");--> statement-breakpoint
CREATE INDEX "provider_record_raw_payload_idx" ON "provider_record" USING btree ("raw_payload_id");
