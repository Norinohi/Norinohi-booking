CREATE TYPE "public"."provider_resource_type" AS ENUM('yacht', 'company', 'base', 'location', 'region', 'country', 'model', 'builder', 'category', 'amenity');--> statement-breakpoint
CREATE TYPE "public"."sync_error_type" AS ENUM('rate_limited', 'transient', 'auth', 'not_found', 'contract');--> statement-breakpoint
CREATE TYPE "public"."sync_kind" AS ENUM('catalogue', 'availability', 'pricing');--> statement-breakpoint
CREATE TYPE "public"."sync_status" AS ENUM('pending', 'running', 'success', 'failed', 'partial');--> statement-breakpoint
CREATE TYPE "public"."listing_status" AS ENUM('draft', 'published', 'hidden');--> statement-breakpoint
CREATE TYPE "public"."media_role" AS ENUM('main', 'layout', 'gallery');--> statement-breakpoint
CREATE TYPE "public"."duplicate_decision" AS ENUM('pending', 'confirmed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."match_status" AS ENUM('unmatched', 'auto', 'confirmed', 'rejected');--> statement-breakpoint
CREATE TABLE "faq" (
	"id" text PRIMARY KEY NOT NULL,
	"listing_id" text NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review" (
	"id" text PRIMARY KEY NOT NULL,
	"listing_id" text NOT NULL,
	"rating" integer NOT NULL,
	"author" text,
	"body" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "base" (
	"id" text PRIMARY KEY NOT NULL,
	"location_id" text NOT NULL,
	"name" text NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"check_in_time" text,
	"check_out_time" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "country" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "country_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "location" (
	"id" text PRIMARY KEY NOT NULL,
	"region_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "region" (
	"id" text PRIMARY KEY NOT NULL,
	"country_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operator" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"country" text,
	"city" text,
	"email" text,
	"phone" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "operator_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "amenity" (
	"id" text PRIMARY KEY NOT NULL,
	"amenity_category_id" text NOT NULL,
	"code" text,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "amenity_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "amenity_category" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "builder" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "builder_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "yacht_category" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "yacht_category_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "yacht_model" (
	"id" text PRIMARY KEY NOT NULL,
	"builder_id" text,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"default_currency" text,
	"config" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "provider_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "provider_raw_payload" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_record" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_id" text NOT NULL,
	"resource_type" "provider_resource_type" NOT NULL,
	"external_id" text NOT NULL,
	"raw_payload_id" text,
	"source_hash" text,
	"source_modified_at" timestamp,
	"imported_at" timestamp DEFAULT now() NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "provider_record_external_uq" UNIQUE("provider_id","resource_type","external_id")
);
--> statement-breakpoint
CREATE TABLE "sync_error" (
	"id" text PRIMARY KEY NOT NULL,
	"sync_run_id" text NOT NULL,
	"error_type" "sync_error_type" NOT NULL,
	"message" text NOT NULL,
	"context" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_run" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_id" text NOT NULL,
	"kind" "sync_kind" NOT NULL,
	"status" "sync_status" DEFAULT 'pending' NOT NULL,
	"cursor" text,
	"created_count" integer DEFAULT 0 NOT NULL,
	"updated_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp,
	"finished_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listing" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"operator_id" text NOT NULL,
	"home_base_id" text NOT NULL,
	"builder_id" text,
	"model_id" text,
	"category_id" text,
	"default_currency" text,
	"status" "listing_status" DEFAULT 'draft' NOT NULL,
	"primary_source_id" text,
	"freshness_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "listing_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "listing_amenity" (
	"id" text PRIMARY KEY NOT NULL,
	"listing_id" text NOT NULL,
	"amenity_id" text NOT NULL,
	"obligatory" boolean DEFAULT false NOT NULL,
	"price_minor" integer,
	"price_currency" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "listing_amenity_uq" UNIQUE("listing_id","amenity_id")
);
--> statement-breakpoint
CREATE TABLE "listing_checkin_rule" (
	"id" text PRIMARY KEY NOT NULL,
	"listing_id" text NOT NULL,
	"checkin_weekday" integer,
	"checkout_weekday" integer,
	"min_nights" integer,
	"max_nights" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listing_media" (
	"id" text PRIMARY KEY NOT NULL,
	"listing_id" text NOT NULL,
	"source" text,
	"external_url" text NOT NULL,
	"role" "media_role" DEFAULT 'gallery' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"width" integer,
	"height" integer,
	"cloudinary_id" text,
	"imported_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listing_one_way_rule" (
	"id" text PRIMARY KEY NOT NULL,
	"listing_id" text NOT NULL,
	"start_date" date,
	"end_date" date,
	"is_one_way" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listing_specification" (
	"id" text PRIMARY KEY NOT NULL,
	"listing_id" text NOT NULL,
	"length_m" numeric(8, 2),
	"beam_m" numeric(8, 2),
	"draft_m" numeric(8, 2),
	"year_built" integer,
	"cabins" integer,
	"berths" integer,
	"heads" integer,
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
	CONSTRAINT "listing_specification_listing_id_unique" UNIQUE("listing_id")
);
--> statement-breakpoint
CREATE TABLE "listing_duplicate_candidate" (
	"id" text PRIMARY KEY NOT NULL,
	"source_a_id" text NOT NULL,
	"source_b_id" text NOT NULL,
	"signals" jsonb,
	"confidence" numeric(6, 4),
	"decision" "duplicate_decision" DEFAULT 'pending' NOT NULL,
	"reviewer" text,
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listing_source" (
	"id" text PRIMARY KEY NOT NULL,
	"listing_id" text,
	"provider_record_id" text NOT NULL,
	"external_yacht_id" text NOT NULL,
	"external_company_id" text,
	"external_base_id" text,
	"match_status" "match_status" DEFAULT 'unmatched' NOT NULL,
	"match_confidence" numeric(6, 4),
	"matched_by" text,
	"matched_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "faq" ADD CONSTRAINT "faq_listing_id_listing_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listing"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_listing_id_listing_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listing"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "base" ADD CONSTRAINT "base_location_id_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."location"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location" ADD CONSTRAINT "location_region_id_region_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."region"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "region" ADD CONSTRAINT "region_country_id_country_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."country"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amenity" ADD CONSTRAINT "amenity_amenity_category_id_amenity_category_id_fk" FOREIGN KEY ("amenity_category_id") REFERENCES "public"."amenity_category"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "yacht_model" ADD CONSTRAINT "yacht_model_builder_id_builder_id_fk" FOREIGN KEY ("builder_id") REFERENCES "public"."builder"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_raw_payload" ADD CONSTRAINT "provider_raw_payload_provider_id_provider_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."provider"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_record" ADD CONSTRAINT "provider_record_provider_id_provider_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."provider"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_record" ADD CONSTRAINT "provider_record_raw_payload_id_provider_raw_payload_id_fk" FOREIGN KEY ("raw_payload_id") REFERENCES "public"."provider_raw_payload"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_error" ADD CONSTRAINT "sync_error_sync_run_id_sync_run_id_fk" FOREIGN KEY ("sync_run_id") REFERENCES "public"."sync_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_run" ADD CONSTRAINT "sync_run_provider_id_provider_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."provider"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing" ADD CONSTRAINT "listing_operator_id_operator_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."operator"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing" ADD CONSTRAINT "listing_home_base_id_base_id_fk" FOREIGN KEY ("home_base_id") REFERENCES "public"."base"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing" ADD CONSTRAINT "listing_builder_id_builder_id_fk" FOREIGN KEY ("builder_id") REFERENCES "public"."builder"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing" ADD CONSTRAINT "listing_model_id_yacht_model_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."yacht_model"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing" ADD CONSTRAINT "listing_category_id_yacht_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."yacht_category"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_amenity" ADD CONSTRAINT "listing_amenity_listing_id_listing_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listing"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_amenity" ADD CONSTRAINT "listing_amenity_amenity_id_amenity_id_fk" FOREIGN KEY ("amenity_id") REFERENCES "public"."amenity"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_checkin_rule" ADD CONSTRAINT "listing_checkin_rule_listing_id_listing_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listing"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_media" ADD CONSTRAINT "listing_media_listing_id_listing_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listing"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_one_way_rule" ADD CONSTRAINT "listing_one_way_rule_listing_id_listing_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listing"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_specification" ADD CONSTRAINT "listing_specification_listing_id_listing_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listing"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_duplicate_candidate" ADD CONSTRAINT "listing_duplicate_candidate_source_a_id_listing_source_id_fk" FOREIGN KEY ("source_a_id") REFERENCES "public"."listing_source"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_duplicate_candidate" ADD CONSTRAINT "listing_duplicate_candidate_source_b_id_listing_source_id_fk" FOREIGN KEY ("source_b_id") REFERENCES "public"."listing_source"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_source" ADD CONSTRAINT "listing_source_listing_id_listing_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listing"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_source" ADD CONSTRAINT "listing_source_provider_record_id_provider_record_id_fk" FOREIGN KEY ("provider_record_id") REFERENCES "public"."provider_record"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "faq_listing_idx" ON "faq" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "review_listing_idx" ON "review" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "base_location_idx" ON "base" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "country_code_idx" ON "country" USING btree ("code");--> statement-breakpoint
CREATE INDEX "location_region_idx" ON "location" USING btree ("region_id");--> statement-breakpoint
CREATE INDEX "region_country_idx" ON "region" USING btree ("country_id");--> statement-breakpoint
CREATE INDEX "operator_slug_idx" ON "operator" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "amenity_category_idx" ON "amenity" USING btree ("amenity_category_id");--> statement-breakpoint
CREATE INDEX "builder_name_idx" ON "builder" USING btree ("name");--> statement-breakpoint
CREATE INDEX "yacht_category_name_idx" ON "yacht_category" USING btree ("name");--> statement-breakpoint
CREATE INDEX "yacht_model_builder_idx" ON "yacht_model" USING btree ("builder_id");--> statement-breakpoint
CREATE INDEX "listing_slug_idx" ON "listing" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "listing_operator_idx" ON "listing" USING btree ("operator_id");--> statement-breakpoint
CREATE INDEX "listing_home_base_idx" ON "listing" USING btree ("home_base_id");--> statement-breakpoint
CREATE INDEX "listing_amenity_listing_idx" ON "listing_amenity" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "listing_checkin_rule_listing_idx" ON "listing_checkin_rule" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "listing_media_listing_idx" ON "listing_media" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "listing_one_way_rule_listing_idx" ON "listing_one_way_rule" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "listing_duplicate_source_a_idx" ON "listing_duplicate_candidate" USING btree ("source_a_id");--> statement-breakpoint
CREATE INDEX "listing_duplicate_source_b_idx" ON "listing_duplicate_candidate" USING btree ("source_b_id");--> statement-breakpoint
CREATE INDEX "listing_source_listing_idx" ON "listing_source" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "listing_source_provider_record_idx" ON "listing_source" USING btree ("provider_record_id");