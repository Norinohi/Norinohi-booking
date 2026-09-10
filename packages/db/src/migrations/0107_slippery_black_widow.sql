CREATE TYPE "public"."suggested_route_difficulty" AS ENUM('easy', 'moderate', 'advanced');--> statement-breakpoint
CREATE TABLE "suggested_route_translation" (
	"id" text PRIMARY KEY NOT NULL,
	"route_id" text NOT NULL,
	"locale" text NOT NULL,
	"title" text,
	"description" text,
	"source" "facet_translation_source" DEFAULT 'editorial' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "suggested_route_translation_locale_key" UNIQUE("route_id","locale")
);
--> statement-breakpoint
ALTER TABLE "marketplace_setting" ADD COLUMN "popular_yachts_config" jsonb;--> statement-breakpoint
ALTER TABLE "facet_media" ADD COLUMN "popular_rank" integer;--> statement-breakpoint
ALTER TABLE "facet_media" ADD COLUMN "featured_rank" integer;--> statement-breakpoint
ALTER TABLE "suggested_route" ADD COLUMN "featured_rank" integer;--> statement-breakpoint
ALTER TABLE "suggested_route" ADD COLUMN "image_url" text;--> statement-breakpoint
ALTER TABLE "suggested_route" ADD COLUMN "cloudinary_id" text;--> statement-breakpoint
ALTER TABLE "suggested_route" ADD COLUMN "difficulty" "suggested_route_difficulty";--> statement-breakpoint
ALTER TABLE "suggested_route_translation" ADD CONSTRAINT "suggested_route_translation_route_id_suggested_route_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."suggested_route"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "suggested_route_translation_locale_idx" ON "suggested_route_translation" USING btree ("locale");--> statement-breakpoint
CREATE INDEX "facet_media_popular_idx" ON "facet_media" USING btree ("kind","popular_rank") WHERE popular_rank is not null;--> statement-breakpoint
CREATE INDEX "facet_media_featured_idx" ON "facet_media" USING btree ("kind","featured_rank") WHERE featured_rank is not null;--> statement-breakpoint
CREATE INDEX "suggested_route_featured_idx" ON "suggested_route" USING btree ("featured_rank") WHERE featured_rank is not null;