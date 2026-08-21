CREATE TABLE "extra_label_translation" (
	"id" text PRIMARY KEY NOT NULL,
	"name_key" text NOT NULL,
	"name" text NOT NULL,
	"locale" text NOT NULL,
	"label" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "extra_label_translation_uq" UNIQUE("name_key","locale")
);
