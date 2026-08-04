CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE TABLE "listing_search_doc" (
	"listing_id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"category" text,
	"builder" text,
	"model" text,
	"operator" text NOT NULL,
	"base_id" text NOT NULL,
	"base_name" text NOT NULL,
	"location" text NOT NULL,
	"region" text NOT NULL,
	"country" text NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"length_m" numeric(8, 2),
	"cabins" integer,
	"berths" integer,
	"heads" integer,
	"year_built" integer,
	"rating" numeric(3, 2) NOT NULL,
	"review_count" integer DEFAULT 0 NOT NULL,
	"main_image" text,
	"gallery" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"amenities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"price_from_minor" integer,
	"currency" text,
	"available_from" date,
	"available_to" date,
	"searchable_text" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "listing_search_doc" ADD CONSTRAINT "listing_search_doc_listing_id_listing_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listing"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "listing_search_doc_slug_idx" ON "listing_search_doc" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "listing_search_doc_country_idx" ON "listing_search_doc" USING btree ("country");--> statement-breakpoint
CREATE INDEX "listing_search_doc_region_idx" ON "listing_search_doc" USING btree ("region");--> statement-breakpoint
CREATE INDEX "listing_search_doc_location_idx" ON "listing_search_doc" USING btree ("location");--> statement-breakpoint
CREATE INDEX "listing_search_doc_category_idx" ON "listing_search_doc" USING btree ("category");--> statement-breakpoint
CREATE INDEX "listing_search_doc_price_idx" ON "listing_search_doc" USING btree ("price_from_minor");--> statement-breakpoint
CREATE INDEX "listing_search_doc_rating_idx" ON "listing_search_doc" USING btree ("rating");--> statement-breakpoint
CREATE INDEX "listing_search_doc_available_idx" ON "listing_search_doc" USING btree ("available_from","available_to");--> statement-breakpoint
CREATE INDEX "listing_search_doc_text_trgm_idx" ON "listing_search_doc" USING gin ("searchable_text" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "listing_search_doc_geo_gist_idx" ON "listing_search_doc" USING gist (point("lng", "lat"));
