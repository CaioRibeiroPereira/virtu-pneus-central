CREATE TYPE "public"."agent_event_status" AS ENUM('aplicado', 'em_revisao', 'duplicado', 'rejeitado', 'erro');--> statement-breakpoint
CREATE TYPE "public"."appointment_status" AS ENUM('agendado', 'confirmado', 'concluido', 'cancelado', 'nao_compareceu');--> statement-breakpoint
CREATE TYPE "public"."audit_action" AS ENUM('create', 'update', 'delete', 'review_decision');--> statement-breakpoint
CREATE TYPE "public"."customer_origin" AS ENUM('whatsapp', 'indicacao', 'balcao', 'instagram', 'google', 'outro');--> statement-breakpoint
CREATE TYPE "public"."customer_stage" AS ENUM('novo_contato', 'em_negociacao', 'orcamento_enviado', 'agendado', 'cliente', 'perdido');--> statement-breakpoint
CREATE TYPE "public"."interaction_channel" AS ENUM('whatsapp', 'telefone', 'balcao');--> statement-breakpoint
CREATE TYPE "public"."quote_status" AS ENUM('rascunho', 'enviado', 'aprovado', 'recusado', 'expirado');--> statement-breakpoint
CREATE TYPE "public"."review_reason" AS ENUM('baixa_confianca', 'cliente_nao_encontrado', 'varios_clientes', 'conflito_edicao_humana', 'alto_impacto');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('pendente', 'aprovado', 'aprovado_editado', 'rejeitado');--> statement-breakpoint
CREATE TYPE "public"."service_type" AS ENUM('troca_pneus', 'alinhamento', 'balanceamento', 'rodizio', 'reparo', 'outro');--> statement-breakpoint
CREATE TYPE "public"."source" AS ENUM('gestor', 'agente', 'sistema');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('pendente', 'concluida', 'cancelada');--> statement-breakpoint
CREATE TYPE "public"."task_type" AS ENUM('retorno_comercial', 'followup_orcamento', 'pos_venda', 'confirmar_agendamento', 'outro');--> statement-breakpoint
CREATE TABLE "agent_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" text NOT NULL,
	"schema_version" text NOT NULL,
	"type" text NOT NULL,
	"conversation_id" text,
	"agent_name" text,
	"model" text,
	"prompt_version" text,
	"confidence" numeric(3, 2) NOT NULL,
	"evidence" text,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "agent_event_status" NOT NULL,
	"result" jsonb,
	"customer_id" uuid,
	CONSTRAINT "agent_events_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"vehicle_id" uuid,
	"scheduled_at" timestamp with time zone NOT NULL,
	"service_type" "service_type" NOT NULL,
	"status" "appointment_status" DEFAULT 'agendado' NOT NULL,
	"source" "source" DEFAULT 'gestor' NOT NULL,
	"agent_event_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"action" "audit_action" NOT NULL,
	"actor_type" "source" NOT NULL,
	"agent_event_id" uuid,
	"before" jsonb,
	"after" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"phone_e164" text,
	"phone_display" text,
	"email" text,
	"city" text,
	"origin" "customer_origin" DEFAULT 'whatsapp' NOT NULL,
	"stage" "customer_stage" DEFAULT 'novo_contato' NOT NULL,
	"loss_reason" text,
	"notes" text,
	"is_provisional" boolean DEFAULT false NOT NULL,
	"human_edited_fields" text[] DEFAULT '{}'::text[] NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"source" "source" DEFAULT 'gestor' NOT NULL,
	"agent_event_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_phone_e164_unique" UNIQUE("phone_e164"),
	CONSTRAINT "customers_loss_reason_when_lost" CHECK ("customers"."stage" <> 'perdido' or coalesce(length(trim("customers"."loss_reason")), 0) > 0)
);
--> statement-breakpoint
CREATE TABLE "interactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"channel" "interaction_channel" NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"summary" text NOT NULL,
	"evidence" text,
	"source" "source" DEFAULT 'gestor' NOT NULL,
	"agent_event_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "legacy_customers" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"vehicle_id" uuid,
	"description" text NOT NULL,
	"tire_size" text,
	"quantity" integer,
	"total" numeric(10, 2) NOT NULL,
	"status" "quote_status" DEFAULT 'rascunho' NOT NULL,
	"sent_at" timestamp with time zone,
	"valid_until" date,
	"responded_at" timestamp with time zone,
	"loss_reason" text,
	"source" "source" DEFAULT 'gestor' NOT NULL,
	"agent_event_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_event_id" uuid NOT NULL,
	"reason" "review_reason" NOT NULL,
	"proposed" jsonb NOT NULL,
	"status" "review_status" DEFAULT 'pendente' NOT NULL,
	"decided_at" timestamp with time zone,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"vehicle_id" uuid,
	"quote_id" uuid,
	"type" "service_type" NOT NULL,
	"description" text NOT NULL,
	"performed_at" timestamp with time zone NOT NULL,
	"total" numeric(10, 2),
	"km" integer,
	"source" "source" DEFAULT 'gestor' NOT NULL,
	"agent_event_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"type" "task_type" NOT NULL,
	"title" text NOT NULL,
	"reason" text NOT NULL,
	"due_date" date NOT NULL,
	"status" "task_status" DEFAULT 'pendente' NOT NULL,
	"snoozed_count" integer DEFAULT 0 NOT NULL,
	"quote_id" uuid,
	"service_id" uuid,
	"appointment_id" uuid,
	"auto_rule" text,
	"completed_at" timestamp with time zone,
	"source" "source" DEFAULT 'gestor' NOT NULL,
	"agent_event_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"plate" text,
	"model" text,
	"year" integer,
	"tire_size" text,
	"notes" text,
	"source" "source" DEFAULT 'gestor' NOT NULL,
	"agent_event_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_events" ADD CONSTRAINT "agent_events_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_agent_event_id_agent_events_id_fk" FOREIGN KEY ("agent_event_id") REFERENCES "public"."agent_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_agent_event_id_agent_events_id_fk" FOREIGN KEY ("agent_event_id") REFERENCES "public"."agent_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_agent_event_id_agent_events_id_fk" FOREIGN KEY ("agent_event_id") REFERENCES "public"."agent_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_agent_event_id_agent_events_id_fk" FOREIGN KEY ("agent_event_id") REFERENCES "public"."agent_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_agent_event_id_agent_events_id_fk" FOREIGN KEY ("agent_event_id") REFERENCES "public"."agent_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_items" ADD CONSTRAINT "review_items_agent_event_id_agent_events_id_fk" FOREIGN KEY ("agent_event_id") REFERENCES "public"."agent_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_agent_event_id_agent_events_id_fk" FOREIGN KEY ("agent_event_id") REFERENCES "public"."agent_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_agent_event_id_agent_events_id_fk" FOREIGN KEY ("agent_event_id") REFERENCES "public"."agent_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_agent_event_id_agent_events_id_fk" FOREIGN KEY ("agent_event_id") REFERENCES "public"."agent_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_events_status_idx" ON "agent_events" USING btree ("status","received_at");--> statement-breakpoint
CREATE INDEX "appointments_scheduled_idx" ON "appointments" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id","at");--> statement-breakpoint
CREATE INDEX "interactions_customer_idx" ON "interactions" USING btree ("customer_id","occurred_at");--> statement-breakpoint
CREATE INDEX "quotes_customer_idx" ON "quotes" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "quotes_status_idx" ON "quotes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "review_items_status_idx" ON "review_items" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "services_customer_idx" ON "services" USING btree ("customer_id","performed_at");--> statement-breakpoint
CREATE INDEX "tasks_due_idx" ON "tasks" USING btree ("status","due_date");--> statement-breakpoint
CREATE INDEX "tasks_customer_idx" ON "tasks" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_auto_rule_unique" ON "tasks" USING btree ("auto_rule","customer_id",coalesce("quote_id"::text, ''),coalesce("service_id"::text, ''),coalesce("appointment_id"::text, '')) WHERE "tasks"."auto_rule" is not null;--> statement-breakpoint
CREATE INDEX "vehicles_customer_idx" ON "vehicles" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "vehicles_plate_idx" ON "vehicles" USING btree ("plate");