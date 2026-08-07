CREATE TABLE "facet_media_translation" (
	"id" text PRIMARY KEY NOT NULL,
	"facet_media_id" text NOT NULL,
	"locale" text NOT NULL,
	"label" text,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "facet_media_translation_locale_key" UNIQUE("facet_media_id","locale")
);
--> statement-breakpoint
ALTER TABLE "facet_media_translation" ADD CONSTRAINT "facet_media_translation_facet_media_id_facet_media_id_fk" FOREIGN KEY ("facet_media_id") REFERENCES "public"."facet_media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "facet_media_translation_locale_idx" ON "facet_media_translation" USING btree ("locale");