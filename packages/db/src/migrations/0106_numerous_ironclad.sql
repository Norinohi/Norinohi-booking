ALTER TABLE "marketplace_setting" ADD COLUMN "display_currency_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "marketplace_setting" ADD COLUMN "display_currency_default" text DEFAULT 'EUR' NOT NULL;--> statement-breakpoint
ALTER TABLE "marketplace_setting" ADD COLUMN "display_currency_by_country" jsonb DEFAULT '{}'::jsonb NOT NULL;