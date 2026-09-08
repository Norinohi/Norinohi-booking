CREATE INDEX "quote_offer_attempt_provider_idx" ON "quote_offer_attempt" USING btree ("provider","created_at");
