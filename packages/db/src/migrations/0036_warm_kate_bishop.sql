ALTER TABLE "payment" ADD COLUMN "disputed_at" timestamp;--> statement-breakpoint
ALTER TABLE "payment" ADD COLUMN "dispute_status" text;