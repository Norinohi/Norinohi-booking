CREATE TABLE "listing_period_price" (
	"listing_id" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"offer_id" text NOT NULL,
	"currency" text NOT NULL,
	"all_in_minor" integer NOT NULL,
	"all_in_minor_eur" integer,
	"base_minor" integer NOT NULL,
	"base_minor_eur" integer,
	"list_all_in_minor" integer,
	CONSTRAINT "listing_period_price_listing_id_start_date_end_date_pk" PRIMARY KEY("listing_id","start_date","end_date")
);
--> statement-breakpoint
ALTER TABLE "listing_period_price" ADD CONSTRAINT "listing_period_price_listing_id_listing_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listing"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "listing_period_price_period_idx" ON "listing_period_price" USING btree ("start_date","end_date");