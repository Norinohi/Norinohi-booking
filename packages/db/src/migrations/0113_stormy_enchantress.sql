CREATE TYPE "public"."provider_media_asset_status" AS ENUM('pending', 'uploaded', 'failed', 'inactive', 'deleted');--> statement-breakpoint
ALTER TYPE "public"."sync_kind" ADD VALUE 'media';--> statement-breakpoint
CREATE TABLE "provider_media_asset" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_id" text NOT NULL,
	"original_url" text NOT NULL,
	"original_url_hash" text NOT NULL,
	"bunny_storage_path" text NOT NULL,
	"bunny_cdn_url" text NOT NULL,
	"content_type" text,
	"byte_size" integer,
	"status" "provider_media_asset_status" DEFAULT 'pending' NOT NULL,
	"upload_attempts" integer DEFAULT 0 NOT NULL,
	"last_upload_error" text,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"inactive_at" timestamp,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "provider_media_asset_original_url_uq" UNIQUE("provider_id","original_url_hash")
);
--> statement-breakpoint
ALTER TABLE "listing_media" ADD COLUMN "provider_media_asset_id" text;--> statement-breakpoint
ALTER TABLE "provider_media_asset" ADD CONSTRAINT "provider_media_asset_provider_id_provider_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."provider"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "provider_media_asset_status_idx" ON "provider_media_asset" USING btree ("provider_id","status","last_seen_at");--> statement-breakpoint
CREATE INDEX "provider_media_asset_cleanup_idx" ON "provider_media_asset" USING btree ("provider_id","status","inactive_at");--> statement-breakpoint
ALTER TABLE "listing_media" ADD CONSTRAINT "listing_media_provider_media_asset_id_provider_media_asset_id_fk" FOREIGN KEY ("provider_media_asset_id") REFERENCES "public"."provider_media_asset"("id") ON DELETE set null ON UPDATE no action;