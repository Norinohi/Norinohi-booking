CREATE TYPE "public"."booking_status" AS ENUM('DRAFT', 'QUOTED', 'OPTION_PENDING', 'OPTION_HELD', 'PAYMENT_PENDING', 'CONFIRMING', 'CONFIRMED', 'QUOTE_EXPIRED', 'OPTION_EXPIRED', 'PAYMENT_FAILED', 'PROVIDER_REJECTED', 'CANCELLED', 'REFUND_PENDING', 'REFUNDED');--> statement-breakpoint
CREATE TYPE "public"."payment_schedule_kind" AS ENUM('deposit', 'balance', 'full');--> statement-breakpoint
CREATE TYPE "public"."payment_schedule_status" AS ENUM('pending', 'paid', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('requires_payment', 'processing', 'succeeded', 'failed', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."provider_reservation_event_kind" AS ENUM('option_created', 'option_released', 'confirm_requested', 'confirm_succeeded', 'confirm_failed', 'cancel_requested', 'cancel_succeeded');--> statement-breakpoint
CREATE TYPE "public"."quote_status" AS ENUM('active', 'expired', 'consumed');--> statement-breakpoint
CREATE TABLE "booking" (
	"id" text PRIMARY KEY NOT NULL,
	"quote_id" text NOT NULL,
	"user_id" text NOT NULL,
	"listing_id" text NOT NULL,
	"status" "booking_status" DEFAULT 'DRAFT' NOT NULL,
	"reference" text NOT NULL,
	"provider" text NOT NULL,
	"provider_reservation_id" text,
	"provider_option_id" text,
	"provider_status" text,
	"hold_expires_at" timestamp,
	"confirmed_at" timestamp,
	"cancelled_at" timestamp,
	"cancel_reason" text,
	"total_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"commercial_snapshot" jsonb NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "booking_reference_unique" UNIQUE("reference"),
	CONSTRAINT "booking_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "booking_provider_option_uq" UNIQUE("provider","provider_option_id")
);
--> statement-breakpoint
CREATE TABLE "booking_extra" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"pricing_type" text,
	"amount_minor" integer,
	"currency" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_traveller" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"full_name" text NOT NULL,
	"role" text,
	"date_of_birth" text,
	"document_number" text,
	"nationality" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"schedule_id" text,
	"kind" "payment_schedule_kind" NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"status" "payment_status" DEFAULT 'requires_payment' NOT NULL,
	"stripe_payment_intent_id" text,
	"failure_reason" text,
	"paid_at" timestamp,
	"refunded_at" timestamp,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payment_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "payment_schedule" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"kind" "payment_schedule_kind" NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"due_at" timestamp,
	"status" "payment_schedule_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_reservation_event" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"kind" "provider_reservation_event_kind" NOT NULL,
	"provider" text NOT NULL,
	"provider_reference" text,
	"payload" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_webhook_event" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"external_event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb,
	"processed_at" timestamp,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "provider_webhook_event_uq" UNIQUE("source","external_event_id")
);
--> statement-breakpoint
CREATE TABLE "quote" (
	"id" text PRIMARY KEY NOT NULL,
	"listing_id" text NOT NULL,
	"user_id" text,
	"provider" text NOT NULL,
	"provider_source_id" text NOT NULL,
	"provider_quote_id" text,
	"check_in" date NOT NULL,
	"check_out" date NOT NULL,
	"guests" integer NOT NULL,
	"extras" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"currency" text NOT NULL,
	"lines" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"total_minor" integer NOT NULL,
	"deposit_minor" integer NOT NULL,
	"payment_policy" jsonb NOT NULL,
	"price_source_hash" text NOT NULL,
	"status" "quote_status" DEFAULT 'active' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"validated_at" timestamp DEFAULT now() NOT NULL,
	"superseded_by_quote_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_quote_id_quote_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quote"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_listing_id_listing_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listing"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_extra" ADD CONSTRAINT "booking_extra_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_traveller" ADD CONSTRAINT "booking_traveller_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_schedule_id_payment_schedule_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."payment_schedule"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_schedule" ADD CONSTRAINT "payment_schedule_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_reservation_event" ADD CONSTRAINT "provider_reservation_event_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote" ADD CONSTRAINT "quote_listing_id_listing_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listing"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote" ADD CONSTRAINT "quote_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "booking_user_idx" ON "booking" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "booking_status_idx" ON "booking" USING btree ("status");--> statement-breakpoint
CREATE INDEX "booking_listing_idx" ON "booking" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "booking_hold_expires_idx" ON "booking" USING btree ("hold_expires_at");--> statement-breakpoint
CREATE INDEX "booking_extra_booking_idx" ON "booking_extra" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "booking_traveller_booking_idx" ON "booking_traveller" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "payment_booking_idx" ON "payment" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "payment_intent_idx" ON "payment" USING btree ("stripe_payment_intent_id");--> statement-breakpoint
CREATE INDEX "payment_schedule_booking_idx" ON "payment_schedule" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "provider_reservation_event_booking_idx" ON "provider_reservation_event" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "quote_listing_idx" ON "quote" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "quote_user_idx" ON "quote" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "quote_status_expires_idx" ON "quote" USING btree ("status","expires_at");