CREATE TYPE "public"."commission_source" AS ENUM('provider', 'agreement');--> statement-breakpoint
ALTER TABLE "availability_slot" ADD COLUMN "commission_minor" integer;--> statement-breakpoint
ALTER TABLE "availability_slot" ADD COLUMN "commission_pct" numeric(6, 4);--> statement-breakpoint
ALTER TABLE "listing_offer" ADD COLUMN "commission_pct" numeric(6, 4);--> statement-breakpoint
ALTER TABLE "listing_offer" ADD COLUMN "commission_seen_at" timestamp;--> statement-breakpoint
ALTER TABLE "quote_offer_attempt" ADD COLUMN "commission_minor" integer;--> statement-breakpoint
ALTER TABLE "quote_offer_attempt" ADD COLUMN "commission_source" "commission_source";