ALTER TABLE "booking_traveller" ALTER COLUMN "first_name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "booking_traveller" ALTER COLUMN "last_name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "booking_traveller" DROP COLUMN "full_name";