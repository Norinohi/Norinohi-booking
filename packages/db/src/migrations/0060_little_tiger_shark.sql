ALTER TABLE "provider_extra_catalogue" ADD COLUMN "season_start" date;--> statement-breakpoint
ALTER TABLE "provider_extra_catalogue" ADD COLUMN "season_end" date;--> statement-breakpoint
ALTER TABLE "provider_extra_catalogue" ADD COLUMN "one_way_only" boolean DEFAULT false NOT NULL;