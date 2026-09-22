CREATE TABLE "provider_invoice" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_id" text NOT NULL,
	"number" text NOT NULL,
	"issued_on" date NOT NULL,
	"provider_reservation_id" text,
	"booking_id" text,
	"currency" text NOT NULL,
	"total_minor" integer NOT NULL,
	"net_minor" integer NOT NULL,
	"document_url" text,
	"lines" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "provider_invoice" ADD CONSTRAINT "provider_invoice_provider_id_provider_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."provider"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_invoice" ADD CONSTRAINT "provider_invoice_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "provider_invoice_number_uq" ON "provider_invoice" USING btree ("provider_id","number");--> statement-breakpoint
CREATE INDEX "provider_invoice_booking_idx" ON "provider_invoice" USING btree ("booking_id");