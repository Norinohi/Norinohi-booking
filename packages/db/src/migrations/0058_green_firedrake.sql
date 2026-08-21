CREATE TABLE "listing_refused_period" (
	"id" text PRIMARY KEY NOT NULL,
	"listing_id" text NOT NULL,
	"listing_source_id" text,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "listing_refused_period_uq" UNIQUE("listing_id","start_date","end_date")
);
--> statement-breakpoint
ALTER TABLE "listing_refused_period" ADD CONSTRAINT "listing_refused_period_listing_id_listing_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listing"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_refused_period" ADD CONSTRAINT "listing_refused_period_listing_source_id_listing_source_id_fk" FOREIGN KEY ("listing_source_id") REFERENCES "public"."listing_source"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "listing_refused_period_lookup_idx" ON "listing_refused_period" USING btree ("listing_id","start_date","end_date");