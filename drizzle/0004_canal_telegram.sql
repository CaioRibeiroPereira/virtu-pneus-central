CREATE TYPE "public"."telegram_author" AS ENUM('cliente', 'vito', 'gestor');--> statement-breakpoint
CREATE TABLE "telegram_chats" (
	"chat_id" text PRIMARY KEY NOT NULL,
	"first_name" text,
	"phone_e164" text,
	"customer_id" uuid,
	"disclosed_at" timestamp with time zone,
	"last_fallback_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telegram_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chat_id" text NOT NULL,
	"author" "telegram_author" NOT NULL,
	"text" text NOT NULL,
	"intent" text,
	"update_id" text,
	"extracted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "telegram_chats" ADD CONSTRAINT "telegram_chats_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_messages" ADD CONSTRAINT "telegram_messages_chat_id_telegram_chats_chat_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."telegram_chats"("chat_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "telegram_chats_customer_idx" ON "telegram_chats" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "telegram_messages_chat_idx" ON "telegram_messages" USING btree ("chat_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "telegram_messages_update_unique" ON "telegram_messages" USING btree ("update_id");