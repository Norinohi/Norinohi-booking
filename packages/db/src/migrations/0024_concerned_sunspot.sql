ALTER TABLE "booking" DROP CONSTRAINT "booking_idempotency_key_unique";--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_user_idempotency_uq" UNIQUE("user_id","idempotency_key");