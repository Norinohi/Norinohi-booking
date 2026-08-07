CREATE TYPE "public"."facet_media_kind" AS ENUM('country', 'region', 'location', 'marina', 'category', 'crew', 'sail_type', 'equipment');--> statement-breakpoint
CREATE TABLE "facet_media" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" "facet_media_kind" NOT NULL,
	"value" text NOT NULL,
	"image_url" text,
	"cloudinary_id" text,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "facet_media_kind_value_key" UNIQUE("kind","value")
);
--> statement-breakpoint
CREATE INDEX "facet_media_kind_idx" ON "facet_media" USING btree ("kind");