CREATE TYPE "public"."listing_text_kind" AS ENUM('description', 'notes', 'conditions', 'one_way_note');--> statement-breakpoint
ALTER TYPE "public"."provider_reservation_event_kind" ADD VALUE 'info_created';--> statement-breakpoint
ALTER TYPE "public"."provider_reservation_event_kind" ADD VALUE 'extras_updated';--> statement-breakpoint
ALTER TYPE "public"."provider_resource_type" ADD VALUE 'country_state';--> statement-breakpoint
ALTER TYPE "public"."provider_resource_type" ADD VALUE 'equipment_category';--> statement-breakpoint
ALTER TYPE "public"."provider_resource_type" ADD VALUE 'service';--> statement-breakpoint
ALTER TYPE "public"."provider_resource_type" ADD VALUE 'price_measure';--> statement-breakpoint
ALTER TYPE "public"."provider_resource_type" ADD VALUE 'season';--> statement-breakpoint
ALTER TYPE "public"."provider_resource_type" ADD VALUE 'price_list';--> statement-breakpoint
ALTER TYPE "public"."provider_resource_type" ADD VALUE 'discount_item';--> statement-breakpoint
ALTER TYPE "public"."provider_resource_type" ADD VALUE 'sail_type';--> statement-breakpoint
ALTER TYPE "public"."provider_resource_type" ADD VALUE 'steering_type';--> statement-breakpoint
ALTER TYPE "public"."provider_resource_type" ADD VALUE 'engine_builder';--> statement-breakpoint
CREATE TABLE "sync_cursor" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_id" text NOT NULL,
	"kind" "sync_kind" NOT NULL,
	"scope" text NOT NULL,
	"cursor" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sync_cursor_scope_uq" UNIQUE("provider_id","kind","scope")
);
--> statement-breakpoint
CREATE TABLE "listing_text" (
	"id" text PRIMARY KEY NOT NULL,
	"listing_id" text NOT NULL,
	"kind" "listing_text_kind" NOT NULL,
	"locale" text NOT NULL,
	"value" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "listing_text_locale_uq" UNIQUE("listing_id","kind","locale")
);
--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "provider_reservation_uuid" text;--> statement-breakpoint
ALTER TABLE "provider_record" ADD COLUMN "last_seen_at" timestamp;--> statement-breakpoint
ALTER TABLE "provider_record" ADD COLUMN "last_seen_sync_run_id" text;--> statement-breakpoint
ALTER TABLE "provider_record" ADD COLUMN "scope_key" text;--> statement-breakpoint
ALTER TABLE "sync_cursor" ADD CONSTRAINT "sync_cursor_provider_id_provider_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."provider"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_text" ADD CONSTRAINT "listing_text_listing_id_listing_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listing"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "listing_text_listing_idx" ON "listing_text" USING btree ("listing_id");--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_provider_provider_code_fk" FOREIGN KEY ("provider") REFERENCES "public"."provider"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_record" ADD CONSTRAINT "provider_record_last_seen_sync_run_id_sync_run_id_fk" FOREIGN KEY ("last_seen_sync_run_id") REFERENCES "public"."sync_run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "provider_record_sweep_idx" ON "provider_record" USING btree ("provider_id","resource_type","scope_key","last_seen_at");