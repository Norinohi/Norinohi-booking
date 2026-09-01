ALTER TABLE "booking" ADD COLUMN "crew_list_submitted_at" timestamp;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "crew_list_accepted" boolean;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "crew_list_message" text;--> statement-breakpoint
ALTER TABLE "booking_traveller" ADD COLUMN "first_name" text;--> statement-breakpoint
ALTER TABLE "booking_traveller" ADD COLUMN "last_name" text;--> statement-breakpoint
ALTER TABLE "booking_traveller" ADD COLUMN "is_skipper" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "booking_traveller" ADD COLUMN "document_type" text;--> statement-breakpoint
ALTER TABLE "booking_traveller" ADD COLUMN "gender" text;--> statement-breakpoint
ALTER TABLE "booking_traveller" ADD COLUMN "birth_place" text;--> statement-breakpoint
ALTER TABLE "booking_traveller" ADD COLUMN "birth_country" text;--> statement-breakpoint
ALTER TABLE "booking_traveller" ADD COLUMN "living_place" text;--> statement-breakpoint
ALTER TABLE "booking_traveller" ADD COLUMN "living_country" text;--> statement-breakpoint
ALTER TABLE "booking_traveller" ADD COLUMN "skipper_licence" text;--> statement-breakpoint
ALTER TABLE "booking_traveller" ADD COLUMN "vhf_licence" text;--> statement-breakpoint
ALTER TABLE "booking_traveller" ADD COLUMN "skipper_email" text;--> statement-breakpoint
ALTER TABLE "booking_traveller" ADD COLUMN "skipper_mobile" text;--> statement-breakpoint
-- Backfill the split names from the single one they replace. Everything before the first
-- space is the given name, the rest is the family name: a guess, but the only one available,
-- and the next migration drops the column it guesses from.
UPDATE "booking_traveller"
SET "first_name" = COALESCE(NULLIF(split_part("full_name", ' ', 1), ''), "full_name"),
    "last_name" = COALESCE(
      NULLIF(substring("full_name" from position(' ' in "full_name") + 1), ''),
      "full_name"
    )
WHERE "first_name" IS NULL;
