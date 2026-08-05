ALTER TABLE "base" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "base" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "base" ADD COLUMN "website" text;--> statement-breakpoint
ALTER TABLE "listing_search_doc" ADD COLUMN "base_email" text;--> statement-breakpoint
ALTER TABLE "listing_search_doc" ADD COLUMN "base_phone" text;--> statement-breakpoint
ALTER TABLE "listing_search_doc" ADD COLUMN "base_website" text;