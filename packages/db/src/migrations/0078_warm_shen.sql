CREATE TABLE "fx_rate" (
	"id" text PRIMARY KEY NOT NULL,
	"base_currency" text NOT NULL,
	"quote_currency" text NOT NULL,
	"rate" numeric(20, 10) NOT NULL,
	"as_of" date NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "listing_search_doc_price_cursor_idx";--> statement-breakpoint
DROP INDEX "listing_search_doc_price_desc_cursor_idx";--> statement-breakpoint
ALTER TABLE "listing_search_doc" ADD COLUMN "price_from_minor_eur" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "fx_rate_pair_idx" ON "fx_rate" USING btree ("base_currency","quote_currency");--> statement-breakpoint
CREATE INDEX "listing_search_doc_price_eur_idx" ON "listing_search_doc" USING btree ("price_from_minor_eur");--> statement-breakpoint
CREATE INDEX "listing_search_doc_price_cursor_idx" ON "listing_search_doc" USING btree (coalesce("price_from_minor_eur", 2147483647),"listing_id");--> statement-breakpoint
CREATE INDEX "listing_search_doc_price_desc_cursor_idx" ON "listing_search_doc" USING btree (coalesce("price_from_minor_eur", -1) desc,"listing_id" DESC NULLS LAST);