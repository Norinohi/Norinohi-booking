CREATE TYPE "public"."outbox_kind" AS ENUM('account_invitation', 'booking_received');--> statement-breakpoint
CREATE TYPE "public"."outbox_status" AS ENUM('pending', 'sent', 'failed');--> statement-breakpoint
CREATE TABLE "outbox_message" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" "outbox_kind" NOT NULL,
	"subject_id" text NOT NULL,
	"status" "outbox_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp DEFAULT now() NOT NULL,
	"last_error" text,
	"sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "outbox_kind_subject_uq" UNIQUE("kind","subject_id")
);
--> statement-breakpoint
CREATE INDEX "outbox_due_idx" ON "outbox_message" USING btree ("status","available_at");