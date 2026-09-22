CREATE TABLE "base_source" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_id" text NOT NULL,
	"external_id" text NOT NULL,
	"base_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "base_source" ADD CONSTRAINT "base_source_provider_id_provider_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."provider"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "base_source" ADD CONSTRAINT "base_source_base_id_base_id_fk" FOREIGN KEY ("base_id") REFERENCES "public"."base"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "base_source_provider_external_uq" ON "base_source" USING btree ("provider_id","external_id");--> statement-breakpoint
CREATE INDEX "base_source_base_idx" ON "base_source" USING btree ("base_id");