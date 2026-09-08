CREATE TABLE "provider_commission" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_id" text NOT NULL,
	"operator_id" text,
	"rate_pct" numeric(6, 4) NOT NULL,
	"starts_at" date,
	"ends_at" date,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "provider_commission_rate_range" CHECK ("provider_commission"."rate_pct" >= 0 and "provider_commission"."rate_pct" <= 100)
);
--> statement-breakpoint
ALTER TABLE "provider_commission" ADD CONSTRAINT "provider_commission_provider_id_provider_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."provider"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_commission" ADD CONSTRAINT "provider_commission_operator_id_operator_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."operator"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_commission" ADD CONSTRAINT "provider_commission_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "provider_commission_provider_idx" ON "provider_commission" USING btree ("provider_id","active");--> statement-breakpoint
CREATE INDEX "provider_commission_operator_idx" ON "provider_commission" USING btree ("operator_id");