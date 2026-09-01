ALTER TABLE "listing" ADD COLUMN "out_of_fleet_date" date;--> statement-breakpoint
ALTER TABLE "listing" ADD COLUMN "video_url" text;--> statement-breakpoint
ALTER TABLE "listing" ADD COLUMN "tour_url" text;--> statement-breakpoint
ALTER TABLE "listing_offer" ADD COLUMN "out_of_fleet_date" date;--> statement-breakpoint
ALTER TABLE "listing_offer" ADD COLUMN "video_url" text;--> statement-breakpoint
ALTER TABLE "listing_offer" ADD COLUMN "tour_url" text;