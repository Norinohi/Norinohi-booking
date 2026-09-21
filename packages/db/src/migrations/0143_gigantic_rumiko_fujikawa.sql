ALTER TABLE "booking" ADD COLUMN "crew_list_note" text;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "crew_list_flight_number" text;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "crew_list_arrival_time" text;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "crew_list_airport_transfer" boolean;--> statement-breakpoint
ALTER TABLE "booking_traveller" ADD COLUMN "disabled_person" text;--> statement-breakpoint
ALTER TABLE "booking_traveller" ADD COLUMN "shoe_size" text;