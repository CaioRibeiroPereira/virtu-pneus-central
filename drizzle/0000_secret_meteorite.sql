CREATE TABLE "customers" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL
);
