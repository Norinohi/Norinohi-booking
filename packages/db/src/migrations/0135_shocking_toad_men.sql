ALTER TABLE "booking" ADD COLUMN "hold_reminder_sent_at" timestamp;--> statement-breakpoint
ALTER TABLE "payment_schedule" ADD COLUMN "final_reminder_sent_at" timestamp;--> statement-breakpoint
ALTER TABLE "payment_schedule" ADD COLUMN "overdue_notice_sent_at" timestamp;