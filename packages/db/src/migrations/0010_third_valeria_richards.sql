CREATE TABLE "discount" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"type" "price_adjustment_type" NOT NULL,
	"value_pct" numeric(8, 4),
	"value_minor" integer,
	"currency" text,
	"starts_at" date,
	"ends_at" date,
	"usage_limit" integer,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "discount_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "discount_redemption" (
	"id" text PRIMARY KEY NOT NULL,
	"discount_id" text NOT NULL,
	"user_id" text NOT NULL,
	"booking_id" text,
	"amount_minor" integer,
	"currency" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "discount_redemption_booking_uq" UNIQUE("discount_id","booking_id")
);
--> statement-breakpoint
CREATE TABLE "discount_target" (
	"id" text PRIMARY KEY NOT NULL,
	"discount_id" text NOT NULL,
	"target_type" "price_adjustment_target_type" NOT NULL,
	"target_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "discount_target_uq" UNIQUE("discount_id","target_type","target_id")
);
--> statement-breakpoint
ALTER TABLE "discount" ADD CONSTRAINT "discount_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discount_redemption" ADD CONSTRAINT "discount_redemption_discount_id_discount_id_fk" FOREIGN KEY ("discount_id") REFERENCES "public"."discount"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discount_redemption" ADD CONSTRAINT "discount_redemption_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discount_target" ADD CONSTRAINT "discount_target_discount_id_discount_id_fk" FOREIGN KEY ("discount_id") REFERENCES "public"."discount"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "discount_active_idx" ON "discount" USING btree ("active");--> statement-breakpoint
CREATE INDEX "discount_code_idx" ON "discount" USING btree ("code");--> statement-breakpoint
CREATE INDEX "discount_redemption_discount_idx" ON "discount_redemption" USING btree ("discount_id");--> statement-breakpoint
CREATE INDEX "discount_redemption_user_idx" ON "discount_redemption" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "discount_target_discount_idx" ON "discount_target" USING btree ("discount_id");