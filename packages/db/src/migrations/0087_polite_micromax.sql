ALTER TABLE "listing" ADD COLUMN "security_deposit_when_insured_minor" integer;--> statement-breakpoint
ALTER TABLE "listing_offer" ADD COLUMN "security_deposit_when_insured_minor" integer;--> statement-breakpoint
ALTER TABLE "provider_extra_catalogue" ADD COLUMN "deposit_insurance" boolean DEFAULT false NOT NULL;