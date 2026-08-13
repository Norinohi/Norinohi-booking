CREATE SEQUENCE "public"."invoice_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
ALTER TABLE "invoice_request" ADD COLUMN "number" text NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_request" ADD COLUMN "issued_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_request" ADD COLUMN "due_at" timestamp NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_request" ADD COLUMN "billing_name" text;--> statement-breakpoint
ALTER TABLE "invoice_request" ADD COLUMN "registration_number" text;--> statement-breakpoint
ALTER TABLE "invoice_request" ADD COLUMN "address_line1" text;--> statement-breakpoint
ALTER TABLE "invoice_request" ADD COLUMN "address_line2" text;--> statement-breakpoint
ALTER TABLE "invoice_request" ADD COLUMN "city" text;--> statement-breakpoint
ALTER TABLE "invoice_request" ADD COLUMN "postal_code" text;--> statement-breakpoint
ALTER TABLE "invoice_request" ADD COLUMN "country_code" text;--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_request_number_idx" ON "invoice_request" USING btree ("number");