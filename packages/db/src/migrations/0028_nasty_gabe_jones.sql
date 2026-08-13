DROP INDEX "listing_source_provider_record_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "base_location_name_uq" ON "base" USING btree ("location_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "location_region_name_uq" ON "location" USING btree ("region_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "region_country_name_uq" ON "region" USING btree ("country_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "amenity_category_name_uq" ON "amenity_category" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "yacht_model_builder_name_uq" ON "yacht_model" USING btree ("builder_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "yacht_model_name_no_builder_uq" ON "yacht_model" USING btree ("name") WHERE "yacht_model"."builder_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "listing_duplicate_pair_uq" ON "listing_duplicate_candidate" USING btree (least("source_a_id", "source_b_id"),greatest("source_a_id", "source_b_id"));--> statement-breakpoint
CREATE UNIQUE INDEX "listing_source_provider_record_uq" ON "listing_source" USING btree ("provider_record_id");