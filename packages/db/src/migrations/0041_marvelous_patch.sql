CREATE TYPE "public"."provider_crew_role" AS ENUM('skipper', 'hostess', 'cook');--> statement-breakpoint
ALTER TABLE "provider_extra_catalogue" ADD COLUMN "crew_role" "provider_crew_role";