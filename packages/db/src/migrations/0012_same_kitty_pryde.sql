CREATE TYPE "public"."booking_consent_kind" AS ENUM('terms', 'cancellation_policy');--> statement-breakpoint
CREATE TYPE "public"."booking_payment_method" AS ENUM('card', 'invoice');--> statement-breakpoint
CREATE TYPE "public"."booking_enquiry_status" AS ENUM('open', 'answered', 'closed');--> statement-breakpoint
CREATE TYPE "public"."invoice_request_status" AS ENUM('pending', 'sent', 'paid', 'cancelled');--> statement-breakpoint
ALTER TYPE "public"."payment_schedule_kind" ADD VALUE 'checkin_extras';--> statement-breakpoint
ALTER TYPE "public"."payment_schedule_kind" ADD VALUE 'security_deposit';--> statement-breakpoint
CREATE TABLE "booking_consent" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"kind" "booking_consent_kind" NOT NULL,
	"policy_version" text NOT NULL,
	"accepted_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "booking_consent_uq" UNIQUE("booking_id","kind")
);
--> statement-breakpoint
CREATE TABLE "booking_enquiry" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"user_id" text NOT NULL,
	"question" text NOT NULL,
	"status" "booking_enquiry_status" DEFAULT 'open' NOT NULL,
	"answer" text,
	"answered_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_request" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"billing_email" text NOT NULL,
	"company_name" text,
	"vat_number" text,
	"amount_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"status" "invoice_request_status" DEFAULT 'pending' NOT NULL,
	"settled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "guest_full_name" text;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "guest_email" text;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "guest_phone" text;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "special_requests" text;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "payment_method" "booking_payment_method";--> statement-breakpoint
ALTER TABLE "quote" ADD COLUMN "security_deposit_minor" integer;--> statement-breakpoint
ALTER TABLE "booking_consent" ADD CONSTRAINT "booking_consent_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_enquiry" ADD CONSTRAINT "booking_enquiry_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_enquiry" ADD CONSTRAINT "booking_enquiry_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_request" ADD CONSTRAINT "invoice_request_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "booking_consent_booking_idx" ON "booking_consent" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "booking_enquiry_booking_idx" ON "booking_enquiry" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "booking_enquiry_status_idx" ON "booking_enquiry" USING btree ("status");--> statement-breakpoint
CREATE INDEX "invoice_request_booking_idx" ON "invoice_request" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "invoice_request_status_idx" ON "invoice_request" USING btree ("status");