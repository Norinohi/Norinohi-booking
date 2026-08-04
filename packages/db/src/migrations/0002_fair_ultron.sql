CREATE TYPE "public"."referral_redemption_status" AS ENUM('pending', 'credited', 'void');--> statement-breakpoint
CREATE TYPE "public"."audit_action" AS ENUM('create', 'update', 'delete', 'sync', 'merge', 'price_adjustment');--> statement-breakpoint
CREATE TYPE "public"."price_adjustment_target_type" AS ENUM('listing', 'operator', 'region', 'category', 'all');--> statement-breakpoint
CREATE TYPE "public"."price_adjustment_type" AS ENUM('percentage', 'fixed_amount');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('customer', 'staff', 'admin');--> statement-breakpoint
CREATE TYPE "public"."availability_slot_status" AS ENUM('available', 'option', 'occupied', 'blocked');--> statement-breakpoint
CREATE TABLE "profile" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"phone" text,
	"locale" text,
	"currency" text,
	"marketing_opt_in" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "profile_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "referral" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"code" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "referral_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "referral_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "referral_redemption" (
	"id" text PRIMARY KEY NOT NULL,
	"referral_id" text NOT NULL,
	"referred_user_id" text NOT NULL,
	"status" "referral_redemption_status" DEFAULT 'pending' NOT NULL,
	"credited_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "referral_redemption_user_uq" UNIQUE("referral_id","referred_user_id")
);
--> statement-breakpoint
CREATE TABLE "wishlist" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text DEFAULT 'Saved yachts' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wishlist_item" (
	"id" text PRIMARY KEY NOT NULL,
	"wishlist_id" text NOT NULL,
	"listing_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "wishlist_item_listing_uq" UNIQUE("wishlist_id","listing_id")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_user_id" text,
	"action" "audit_action" NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"before" jsonb,
	"after" jsonb,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_adjustment_rule" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" "price_adjustment_type" NOT NULL,
	"value_minor" integer,
	"value_pct" numeric(8, 4),
	"currency" text,
	"priority" integer DEFAULT 0 NOT NULL,
	"stackable" boolean DEFAULT false NOT NULL,
	"starts_at" date,
	"ends_at" date,
	"booking_window_start" date,
	"booking_window_end" date,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_adjustment_target" (
	"id" text PRIMARY KEY NOT NULL,
	"rule_id" text NOT NULL,
	"target_type" "price_adjustment_target_type" NOT NULL,
	"target_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "availability_slot" (
	"id" text PRIMARY KEY NOT NULL,
	"listing_id" text NOT NULL,
	"listing_source_id" text,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"status" "availability_slot_status" NOT NULL,
	"price_minor" integer,
	"currency" text,
	"min_nights" integer,
	"checkin_weekday" integer,
	"checkout_weekday" integer,
	"source_hash" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "availability_slot_period_uq" UNIQUE("listing_id","start_date","end_date")
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "role" "user_role" DEFAULT 'customer' NOT NULL;--> statement-breakpoint
ALTER TABLE "profile" ADD CONSTRAINT "profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral" ADD CONSTRAINT "referral_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_redemption" ADD CONSTRAINT "referral_redemption_referral_id_referral_id_fk" FOREIGN KEY ("referral_id") REFERENCES "public"."referral"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_redemption" ADD CONSTRAINT "referral_redemption_referred_user_id_user_id_fk" FOREIGN KEY ("referred_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist" ADD CONSTRAINT "wishlist_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_item" ADD CONSTRAINT "wishlist_item_wishlist_id_wishlist_id_fk" FOREIGN KEY ("wishlist_id") REFERENCES "public"."wishlist"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_item" ADD CONSTRAINT "wishlist_item_listing_id_listing_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listing"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_adjustment_rule" ADD CONSTRAINT "price_adjustment_rule_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_adjustment_target" ADD CONSTRAINT "price_adjustment_target_rule_id_price_adjustment_rule_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."price_adjustment_rule"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_slot" ADD CONSTRAINT "availability_slot_listing_id_listing_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listing"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_slot" ADD CONSTRAINT "availability_slot_listing_source_id_listing_source_id_fk" FOREIGN KEY ("listing_source_id") REFERENCES "public"."listing_source"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "referral_code_idx" ON "referral" USING btree ("code");--> statement-breakpoint
CREATE INDEX "referral_redemption_referral_idx" ON "referral_redemption" USING btree ("referral_id");--> statement-breakpoint
CREATE INDEX "wishlist_user_idx" ON "wishlist" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "wishlist_item_wishlist_idx" ON "wishlist_item" USING btree ("wishlist_id");--> statement-breakpoint
CREATE INDEX "wishlist_item_listing_idx" ON "wishlist_item" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "audit_log_actor_idx" ON "audit_log" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "price_adjustment_rule_active_idx" ON "price_adjustment_rule" USING btree ("active");--> statement-breakpoint
CREATE INDEX "price_adjustment_rule_created_by_idx" ON "price_adjustment_rule" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "price_adjustment_target_rule_idx" ON "price_adjustment_target" USING btree ("rule_id");--> statement-breakpoint
CREATE INDEX "availability_slot_listing_idx" ON "availability_slot" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "availability_slot_dates_idx" ON "availability_slot" USING btree ("start_date","end_date");