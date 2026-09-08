ALTER TABLE "quote_offer_attempt" ADD COLUMN "base_minor" integer;--> statement-breakpoint
ALTER TABLE "quote_offer_attempt" ADD COLUMN "obligatory_extras_minor" integer;--> statement-breakpoint
ALTER TABLE "quote_offer_attempt" ADD COLUMN "commission_pct" numeric(6, 4);