ALTER TABLE "provider_extra_catalogue" ADD COLUMN "valid_routes" text[];--> statement-breakpoint
ALTER TABLE "provider_extra_catalogue" ADD COLUMN "included_external_ids" text[];--> statement-breakpoint
ALTER TABLE "provider_extra_catalogue" ADD COLUMN "quantity_limit" integer;--> statement-breakpoint
ALTER TABLE "provider_extra_catalogue" ADD COLUMN "quantity_selectable" boolean;