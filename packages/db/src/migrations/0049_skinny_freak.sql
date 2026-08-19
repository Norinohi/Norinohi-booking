ALTER TABLE "listing" ADD COLUMN "security_deposit_minor" integer;--> statement-breakpoint
ALTER TABLE "listing" ADD COLUMN "security_deposit_currency" text;--> statement-breakpoint
ALTER TABLE "listing_search_doc" ADD COLUMN "security_deposit_minor" integer;--> statement-breakpoint
ALTER TABLE "listing_search_doc" ADD COLUMN "security_deposit_currency" text;