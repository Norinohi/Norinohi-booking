CREATE TYPE "public"."extra_pricing_type" AS ENUM('per_booking', 'per_week', 'pay_at_check_in');--> statement-breakpoint
ALTER TABLE "booking_extra" ALTER COLUMN "pricing_type" SET DATA TYPE "public"."extra_pricing_type" USING "pricing_type"::"public"."extra_pricing_type";--> statement-breakpoint
ALTER TABLE "price_adjustment_snapshot" ALTER COLUMN "type" SET DATA TYPE "public"."price_adjustment_type" USING "type"::"public"."price_adjustment_type";--> statement-breakpoint
ALTER TABLE "price_adjustment_snapshot" ADD COLUMN "currency" text NOT NULL;