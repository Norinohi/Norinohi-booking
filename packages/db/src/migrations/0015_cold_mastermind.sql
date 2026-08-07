CREATE TYPE "public"."price_adjustment_source" AS ENUM('rule', 'discount');--> statement-breakpoint
CREATE TABLE "price_adjustment_snapshot" (
	"id" text PRIMARY KEY NOT NULL,
	"quote_id" text NOT NULL,
	"source" "price_adjustment_source" NOT NULL,
	"source_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"value_pct" numeric(8, 4),
	"value_minor" integer,
	"amount_minor" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "listing" ADD COLUMN "payment_policy" jsonb;--> statement-breakpoint
ALTER TABLE "quote" ADD COLUMN "discount_id" text;--> statement-breakpoint
ALTER TABLE "quote" ADD COLUMN "discount_code" text;--> statement-breakpoint
ALTER TABLE "price_adjustment_snapshot" ADD CONSTRAINT "price_adjustment_snapshot_quote_id_quote_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quote"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "price_adjustment_snapshot_quote_idx" ON "price_adjustment_snapshot" USING btree ("quote_id");