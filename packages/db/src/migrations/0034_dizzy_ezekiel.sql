ALTER TABLE "user" ADD COLUMN "provisioned_at" timestamp;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "guest_access_token_hash" text;