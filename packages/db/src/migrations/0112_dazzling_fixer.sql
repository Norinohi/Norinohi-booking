ALTER TABLE "amenity" ADD COLUMN "canonical_name" text;--> statement-breakpoint
CREATE INDEX "amenity_canonical_name_idx" ON "amenity" USING btree ("canonical_name");