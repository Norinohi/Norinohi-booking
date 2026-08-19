ALTER TABLE "builder" ADD COLUMN "canonical_name" text;--> statement-breakpoint
CREATE INDEX "builder_canonical_name_idx" ON "builder" USING btree ("canonical_name");