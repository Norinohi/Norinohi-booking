CREATE TYPE "public"."provider_extra_kind" AS ENUM('service', 'equipment');--> statement-breakpoint
CREATE TABLE "provider_extra_catalogue" (
	"id" text PRIMARY KEY NOT NULL,
	"listing_id" text NOT NULL,
	"source" text NOT NULL,
	"kind" "provider_extra_kind" NOT NULL,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"obligatory" boolean DEFAULT false NOT NULL,
	"price_minor" integer,
	"price_currency" text,
	"price_measure" text,
	"calculation_type" text,
	"on_request_only" boolean DEFAULT false NOT NULL,
	"external_season_id" text,
	"external_base_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "provider_extra_catalogue_uq" UNIQUE("listing_id","source","kind","external_id")
);
--> statement-breakpoint
ALTER TABLE "provider_extra_catalogue" ADD CONSTRAINT "provider_extra_catalogue_listing_id_listing_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listing"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "provider_extra_catalogue_listing_idx" ON "provider_extra_catalogue" USING btree ("listing_id");