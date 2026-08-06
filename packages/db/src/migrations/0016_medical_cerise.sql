CREATE TYPE "public"."credit_kind" AS ENUM('referral_reward', 'booking_redemption', 'expiry', 'adjustment');--> statement-breakpoint
CREATE TABLE "credit_ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" "credit_kind" NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"booking_id" text,
	"referral_redemption_id" text,
	"expires_at" timestamp,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loyalty_perk" (
	"id" text PRIMARY KEY NOT NULL,
	"tier_id" text NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loyalty_tier" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"level" integer NOT NULL,
	"required_bookings" integer NOT NULL,
	"referral_bonus_pct" numeric(6, 4) DEFAULT '0' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "loyalty_tier_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_referral_redemption_id_referral_redemption_id_fk" FOREIGN KEY ("referral_redemption_id") REFERENCES "public"."referral_redemption"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_perk" ADD CONSTRAINT "loyalty_perk_tier_id_loyalty_tier_id_fk" FOREIGN KEY ("tier_id") REFERENCES "public"."loyalty_tier"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "credit_ledger_user_idx" ON "credit_ledger" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "credit_ledger_expires_idx" ON "credit_ledger" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "loyalty_perk_tier_idx" ON "loyalty_perk" USING btree ("tier_id");--> statement-breakpoint
CREATE INDEX "loyalty_tier_level_idx" ON "loyalty_tier" USING btree ("level");