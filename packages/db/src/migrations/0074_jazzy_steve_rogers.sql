CREATE TYPE "public"."listing_field" AS ENUM('title', 'spec', 'taxonomy', 'operator', 'home_base', 'pets', 'media', 'description');--> statement-breakpoint
CREATE TYPE "public"."offer_status" AS ENUM('active', 'suppressed', 'retired');--> statement-breakpoint
CREATE TYPE "public"."quote_offer_outcome" AS ENUM('won', 'lost', 'error', 'timeout', 'ineligible');--> statement-breakpoint
ALTER TYPE "public"."listing_status" ADD VALUE 'merged';--> statement-breakpoint
ALTER TYPE "public"."duplicate_decision" ADD VALUE 'deferred';--> statement-breakpoint
CREATE TABLE "listing_field_source" (
	"id" text PRIMARY KEY NOT NULL,
	"listing_id" text NOT NULL,
	"field" "listing_field" NOT NULL,
	"listing_offer_id" text NOT NULL,
	"locked" boolean DEFAULT false NOT NULL,
	"decided_by" text,
	"decided_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "listing_field_source_uq" UNIQUE("listing_id","field")
);
--> statement-breakpoint
CREATE TABLE "listing_offer" (
	"id" text PRIMARY KEY NOT NULL,
	"listing_id" text NOT NULL,
	"listing_source_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"status" "offer_status" DEFAULT 'active' NOT NULL,
	"default_currency" text,
	"payment_policy" jsonb,
	"security_deposit_minor" integer,
	"security_deposit_currency" text,
	"deposit_insurance_included" boolean DEFAULT false NOT NULL,
	"crew_type" text,
	"provider_rating" numeric(3, 2),
	"provider_review_count" integer,
	"title" text,
	"operator_id" text,
	"home_base_id" text,
	"builder_id" text,
	"model_id" text,
	"category_id" text,
	"pets_allowed" boolean DEFAULT false NOT NULL,
	"name_key" text,
	"catalogue_synced_at" timestamp,
	"prices_synced_at" timestamp,
	"availability_synced_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "listing_offer_source_uq" UNIQUE("listing_source_id"),
	CONSTRAINT "listing_offer_provider_uq" UNIQUE("listing_id","provider_id"),
	CONSTRAINT "listing_offer_identity_uq" UNIQUE("id","listing_id")
);
--> statement-breakpoint
CREATE TABLE "listing_offer_specification" (
	"id" text PRIMARY KEY NOT NULL,
	"listing_offer_id" text NOT NULL,
	"length_m" numeric(8, 2),
	"beam_m" numeric(8, 2),
	"draft_m" numeric(8, 2),
	"year_built" integer,
	"cabins" integer,
	"berths" integer,
	"heads" integer,
	"showers" integer,
	"engines" integer,
	"engine_power" text,
	"fuel_type" text,
	"fuel_capacity" integer,
	"water_capacity" integer,
	"propulsion_type" text,
	"steering_type" text,
	"sail_type" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "listing_offer_specification_listing_offer_id_unique" UNIQUE("listing_offer_id")
);
--> statement-breakpoint
CREATE TABLE "quote_offer_attempt" (
	"id" text PRIMARY KEY NOT NULL,
	"quote_id" text,
	"listing_id" text NOT NULL,
	"listing_offer_id" text,
	"provider" text NOT NULL,
	"check_in" date NOT NULL,
	"check_out" date NOT NULL,
	"outcome" "quote_offer_outcome" NOT NULL,
	"total_minor" integer,
	"currency" text,
	"latency_ms" integer,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "availability_slot" ADD COLUMN "listing_offer_id" text;--> statement-breakpoint
ALTER TABLE "listing_free_period" ADD COLUMN "listing_offer_id" text;--> statement-breakpoint
ALTER TABLE "listing_price_period" ADD COLUMN "listing_offer_id" text;--> statement-breakpoint
ALTER TABLE "listing_refused_period" ADD COLUMN "listing_offer_id" text;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "listing_offer_id" text;--> statement-breakpoint
ALTER TABLE "listing" ADD COLUMN "merged_into_listing_id" text;--> statement-breakpoint
ALTER TABLE "listing_amenity" ADD COLUMN "listing_offer_id" text;--> statement-breakpoint
ALTER TABLE "listing_checkin_rule" ADD COLUMN "listing_offer_id" text;--> statement-breakpoint
ALTER TABLE "listing_media" ADD COLUMN "listing_offer_id" text;--> statement-breakpoint
ALTER TABLE "listing_one_way_rule" ADD COLUMN "listing_offer_id" text;--> statement-breakpoint
ALTER TABLE "listing_duplicate_candidate" ADD COLUMN "reviewer_note" text;--> statement-breakpoint
ALTER TABLE "listing_duplicate_candidate" ADD COLUMN "auto_eligible" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "provider_extra_catalogue" ADD COLUMN "listing_offer_id" text;--> statement-breakpoint
ALTER TABLE "listing_text" ADD COLUMN "listing_offer_id" text;--> statement-breakpoint
ALTER TABLE "quote" ADD COLUMN "listing_offer_id" text;--> statement-breakpoint
ALTER TABLE "listing_field_source" ADD CONSTRAINT "listing_field_source_listing_id_listing_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listing"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_field_source" ADD CONSTRAINT "listing_field_source_listing_offer_id_listing_offer_id_fk" FOREIGN KEY ("listing_offer_id") REFERENCES "public"."listing_offer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_offer" ADD CONSTRAINT "listing_offer_listing_id_listing_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listing"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_offer" ADD CONSTRAINT "listing_offer_listing_source_id_listing_source_id_fk" FOREIGN KEY ("listing_source_id") REFERENCES "public"."listing_source"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_offer" ADD CONSTRAINT "listing_offer_provider_id_provider_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."provider"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_offer" ADD CONSTRAINT "listing_offer_operator_id_operator_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."operator"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_offer" ADD CONSTRAINT "listing_offer_home_base_id_base_id_fk" FOREIGN KEY ("home_base_id") REFERENCES "public"."base"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_offer" ADD CONSTRAINT "listing_offer_builder_id_builder_id_fk" FOREIGN KEY ("builder_id") REFERENCES "public"."builder"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_offer" ADD CONSTRAINT "listing_offer_model_id_yacht_model_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."yacht_model"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_offer" ADD CONSTRAINT "listing_offer_category_id_yacht_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."yacht_category"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_offer_specification" ADD CONSTRAINT "listing_offer_specification_listing_offer_id_listing_offer_id_fk" FOREIGN KEY ("listing_offer_id") REFERENCES "public"."listing_offer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_offer_attempt" ADD CONSTRAINT "quote_offer_attempt_quote_id_quote_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quote"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_offer_attempt" ADD CONSTRAINT "quote_offer_attempt_listing_id_listing_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listing"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_offer_attempt" ADD CONSTRAINT "quote_offer_attempt_listing_offer_id_listing_offer_id_fk" FOREIGN KEY ("listing_offer_id") REFERENCES "public"."listing_offer"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "listing_field_source_offer_idx" ON "listing_field_source" USING btree ("listing_offer_id");--> statement-breakpoint
CREATE INDEX "listing_offer_listing_idx" ON "listing_offer" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "listing_offer_name_key_idx" ON "listing_offer" USING btree ("name_key");--> statement-breakpoint
CREATE INDEX "listing_offer_base_name_idx" ON "listing_offer" USING btree ("home_base_id","name_key");--> statement-breakpoint
CREATE INDEX "quote_offer_attempt_quote_idx" ON "quote_offer_attempt" USING btree ("quote_id");--> statement-breakpoint
CREATE INDEX "quote_offer_attempt_listing_idx" ON "quote_offer_attempt" USING btree ("listing_id","created_at");--> statement-breakpoint
ALTER TABLE "availability_slot" ADD CONSTRAINT "availability_slot_listing_offer_id_listing_offer_id_fk" FOREIGN KEY ("listing_offer_id") REFERENCES "public"."listing_offer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_free_period" ADD CONSTRAINT "listing_free_period_listing_offer_id_listing_offer_id_fk" FOREIGN KEY ("listing_offer_id") REFERENCES "public"."listing_offer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_price_period" ADD CONSTRAINT "listing_price_period_listing_offer_id_listing_offer_id_fk" FOREIGN KEY ("listing_offer_id") REFERENCES "public"."listing_offer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_refused_period" ADD CONSTRAINT "listing_refused_period_listing_offer_id_listing_offer_id_fk" FOREIGN KEY ("listing_offer_id") REFERENCES "public"."listing_offer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_listing_offer_id_listing_offer_id_fk" FOREIGN KEY ("listing_offer_id") REFERENCES "public"."listing_offer"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing" ADD CONSTRAINT "listing_merged_into_listing_id_listing_id_fk" FOREIGN KEY ("merged_into_listing_id") REFERENCES "public"."listing"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_amenity" ADD CONSTRAINT "listing_amenity_listing_offer_id_listing_offer_id_fk" FOREIGN KEY ("listing_offer_id") REFERENCES "public"."listing_offer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_checkin_rule" ADD CONSTRAINT "listing_checkin_rule_listing_offer_id_listing_offer_id_fk" FOREIGN KEY ("listing_offer_id") REFERENCES "public"."listing_offer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_media" ADD CONSTRAINT "listing_media_listing_offer_id_listing_offer_id_fk" FOREIGN KEY ("listing_offer_id") REFERENCES "public"."listing_offer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_one_way_rule" ADD CONSTRAINT "listing_one_way_rule_listing_offer_id_listing_offer_id_fk" FOREIGN KEY ("listing_offer_id") REFERENCES "public"."listing_offer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_extra_catalogue" ADD CONSTRAINT "provider_extra_catalogue_listing_offer_id_listing_offer_id_fk" FOREIGN KEY ("listing_offer_id") REFERENCES "public"."listing_offer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_text" ADD CONSTRAINT "listing_text_listing_offer_id_listing_offer_id_fk" FOREIGN KEY ("listing_offer_id") REFERENCES "public"."listing_offer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote" ADD CONSTRAINT "quote_listing_offer_id_listing_offer_id_fk" FOREIGN KEY ("listing_offer_id") REFERENCES "public"."listing_offer"("id") ON DELETE restrict ON UPDATE no action;