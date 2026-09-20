ALTER TABLE "marketplace_setting" ADD COLUMN "referral_reward_minor" integer DEFAULT 10000 NOT NULL;--> statement-breakpoint
ALTER TABLE "marketplace_setting" ADD COLUMN "invitee_discount_minor" integer DEFAULT 10000 NOT NULL;--> statement-breakpoint
ALTER TABLE "marketplace_setting" ADD COLUMN "credit_min_booking_minor" integer DEFAULT 100000 NOT NULL;--> statement-breakpoint
ALTER TABLE "marketplace_setting" ADD COLUMN "credit_ttl_months" integer DEFAULT 12 NOT NULL;