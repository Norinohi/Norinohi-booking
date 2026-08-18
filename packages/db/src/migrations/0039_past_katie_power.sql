ALTER TABLE "yacht_category" ADD COLUMN "canonical_name" text;--> statement-breakpoint
CREATE INDEX "yacht_category_canonical_name_idx" ON "yacht_category" USING btree ("canonical_name");