CREATE TABLE "suggested_route_stop_translation" (
	"id" text PRIMARY KEY NOT NULL,
	"stop_id" text NOT NULL,
	"locale" text NOT NULL,
	"note" text,
	"source" "facet_translation_source" DEFAULT 'editorial' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "suggested_route_stop_translation_locale_key" UNIQUE("stop_id","locale")
);
--> statement-breakpoint
ALTER TABLE "suggested_route_stop_translation" ADD CONSTRAINT "suggested_route_stop_translation_stop_id_suggested_route_stop_id_fk" FOREIGN KEY ("stop_id") REFERENCES "public"."suggested_route_stop"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "suggested_route_stop_translation_locale_idx" ON "suggested_route_stop_translation" USING btree ("locale");