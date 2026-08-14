CREATE TABLE "listing_view" (
	"id" text PRIMARY KEY NOT NULL,
	"listing_id" text NOT NULL,
	"viewed_on" date NOT NULL,
	"viewer_key" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "listing_view_daily_uq" UNIQUE("listing_id","viewed_on","viewer_key")
);
--> statement-breakpoint
ALTER TABLE "listing_view" ADD CONSTRAINT "listing_view_listing_id_listing_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listing"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "listing_view_day_idx" ON "listing_view" USING btree ("viewed_on");