CREATE TABLE "provider_extra_translation" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"kind" "provider_extra_kind" NOT NULL,
	"external_id" text NOT NULL,
	"locale" text NOT NULL,
	"label" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "provider_extra_translation_uq" UNIQUE("source","kind","external_id","locale")
);
--> statement-breakpoint
CREATE INDEX "provider_extra_translation_lookup_idx" ON "provider_extra_translation" USING btree ("source","kind","external_id");