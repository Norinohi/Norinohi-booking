CREATE TYPE "public"."payment_policy_source" AS ENUM('vendor', 'marketplace');--> statement-breakpoint
CREATE TABLE "marketplace_setting" (
	"id" text PRIMARY KEY DEFAULT 'singleton' NOT NULL,
	"payment_policy_source" "payment_policy_source" DEFAULT 'vendor' NOT NULL,
	"marketplace_mode" text DEFAULT 'deposit' NOT NULL,
	"marketplace_deposit_pct" numeric(6, 4) DEFAULT '0.5000' NOT NULL,
	"enforce_deposit_lead_time" boolean DEFAULT true NOT NULL,
	"deposit_lead_time_days" integer DEFAULT 60 NOT NULL,
	"updated_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "marketplace_setting_singleton" CHECK ("marketplace_setting"."id" = 'singleton')
);
--> statement-breakpoint
ALTER TABLE "marketplace_setting" ADD CONSTRAINT "marketplace_setting_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;