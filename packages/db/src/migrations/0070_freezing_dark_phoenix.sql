CREATE TYPE "public"."faq_category" AS ENUM('booking', 'payment', 'prices', 'licences', 'travel', 'cancellation');--> statement-breakpoint
CREATE TYPE "public"."suggested_route_kind" AS ENUM('seven_days', 'fourteen_days', 'family', 'first_time_sailors', 'active_sailing');--> statement-breakpoint
CREATE TABLE "suggested_route" (
	"id" text PRIMARY KEY NOT NULL,
	"base_id" text,
	"region_id" text,
	"title" text NOT NULL,
	"kind" "suggested_route_kind" NOT NULL,
	"nights" integer NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "suggested_route_target_ck" CHECK (("suggested_route"."base_id" is null) <> ("suggested_route"."region_id" is null))
);
--> statement-breakpoint
CREATE TABLE "suggested_route_stop" (
	"id" text PRIMARY KEY NOT NULL,
	"route_id" text NOT NULL,
	"name" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"sort_order" integer NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "faq" ALTER COLUMN "listing_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "faq" ALTER COLUMN "answer" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "faq" ADD COLUMN "category" "faq_category";--> statement-breakpoint
ALTER TABLE "faq" ADD COLUMN "locale" text DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "suggested_route" ADD CONSTRAINT "suggested_route_base_id_base_id_fk" FOREIGN KEY ("base_id") REFERENCES "public"."base"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggested_route" ADD CONSTRAINT "suggested_route_region_id_region_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."region"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggested_route_stop" ADD CONSTRAINT "suggested_route_stop_route_id_suggested_route_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."suggested_route"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "suggested_route_base_idx" ON "suggested_route" USING btree ("base_id");--> statement-breakpoint
CREATE INDEX "suggested_route_region_idx" ON "suggested_route" USING btree ("region_id");--> statement-breakpoint
CREATE INDEX "suggested_route_stop_route_idx" ON "suggested_route_stop" USING btree ("route_id");--> statement-breakpoint
CREATE UNIQUE INDEX "suggested_route_stop_order_uq" ON "suggested_route_stop" USING btree ("route_id","sort_order");--> statement-breakpoint
CREATE INDEX "faq_site_wide_idx" ON "faq" USING btree ("locale","category","sort_order") WHERE "faq"."listing_id" is null;--> statement-breakpoint
ALTER TABLE "faq" ADD CONSTRAINT "faq_scope_ck" CHECK ("faq"."listing_id" is not null or "faq"."category" is not null);