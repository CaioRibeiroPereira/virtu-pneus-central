// Modelo de dados (docs/PLANO_DESENVOLVIMENTO.md §6).
// Convenções: ids uuid gerados no servidor; instantes em timestamptz (UTC); datas de calendário
// da loja em `date`; toda entidade que o agente pode criar guarda `source` e `agent_event_id`.
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

// ---------- Enums ----------

export const sourceEnum = pgEnum("source", ["gestor", "agente", "sistema"]);
export const customerOriginEnum = pgEnum("customer_origin", [
  "whatsapp",
  "indicacao",
  "balcao",
  "instagram",
  "google",
  "outro",
]);
export const customerStageEnum = pgEnum("customer_stage", [
  "novo_contato",
  "em_negociacao",
  "orcamento_enviado",
  "agendado",
  "cliente",
  "perdido",
]);
export const interactionChannelEnum = pgEnum("interaction_channel", [
  "whatsapp",
  "telefone",
  "balcao",
]);
export const quoteStatusEnum = pgEnum("quote_status", [
  "rascunho",
  "enviado",
  "aprovado",
  "recusado",
  "expirado",
]);
export const serviceTypeEnum = pgEnum("service_type", [
  "troca_pneus",
  "alinhamento",
  "balanceamento",
  "rodizio",
  "reparo",
  "outro",
]);
export const appointmentStatusEnum = pgEnum("appointment_status", [
  "agendado",
  "confirmado",
  "concluido",
  "cancelado",
  "nao_compareceu",
]);
export const taskTypeEnum = pgEnum("task_type", [
  "retorno_comercial",
  "followup_orcamento",
  "pos_venda",
  "confirmar_agendamento",
  "outro",
]);
export const taskStatusEnum = pgEnum("task_status", ["pendente", "concluida", "cancelada"]);
export const agentEventStatusEnum = pgEnum("agent_event_status", [
  "aplicado",
  "em_revisao",
  "duplicado",
  "rejeitado",
  "erro",
]);
export const reviewReasonEnum = pgEnum("review_reason", [
  "baixa_confianca",
  "cliente_nao_encontrado",
  "varios_clientes",
  "conflito_edicao_humana",
  "alto_impacto",
]);
export const reviewStatusEnum = pgEnum("review_status", [
  "pendente",
  "aprovado",
  "aprovado_editado",
  "rejeitado",
]);
export const auditActionEnum = pgEnum("audit_action", [
  "create",
  "update",
  "delete",
  "review_decision",
]);

// ---------- Colunas comuns ----------

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/** Origem do registro: quem criou e, se foi o agente, qual evento. */
const origin = () => ({
  source: sourceEnum("source").notNull().default("gestor"),
  agentEventId: uuid("agent_event_id").references((): AnyPgColumn => agentEvents.id, {
    onDelete: "set null",
  }),
});

const money = (name: string) => numeric(name, { precision: 10, scale: 2, mode: "number" });

// ---------- Tabelas ----------

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    /** Chave de identificação pelo WhatsApp: "+5519988887777". */
    phoneE164: text("phone_e164").unique(),
    /** Como foi informado/exibido: "(19) 98888-7777". */
    phoneDisplay: text("phone_display"),
    email: text("email"),
    city: text("city"),
    origin: customerOriginEnum("origin").notNull().default("whatsapp"),
    stage: customerStageEnum("stage").notNull().default("novo_contato"),
    lossReason: text("loss_reason"),
    notes: text("notes"),
    /** Criado pelo agente sem confirmação do gestor. */
    isProvisional: boolean("is_provisional").notNull().default(false),
    /** Campos que o gestor editou: o agente não sobrescreve sem revisão. */
    humanEditedFields: text("human_edited_fields")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** Trava otimista: incrementa a cada atualização. */
    version: integer("version").notNull().default(1),
    ...origin(),
    ...timestamps,
  },
  (t) => [
    check(
      "customers_loss_reason_when_lost",
      sql`${t.stage} <> 'perdido' or coalesce(length(trim(${t.lossReason})), 0) > 0`,
    ),
  ],
);

export const vehicles = pgTable(
  "vehicles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    /** Normalizada: maiúsculas, sem traço ("ABC1D23"). */
    plate: text("plate"),
    model: text("model"),
    year: integer("year"),
    /** Ex.: "205/55 R16". */
    tireSize: text("tire_size"),
    notes: text("notes"),
    ...origin(),
    ...timestamps,
  },
  (t) => [index("vehicles_customer_idx").on(t.customerId), index("vehicles_plate_idx").on(t.plate)],
);

export const interactions = pgTable(
  "interactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    channel: interactionChannelEnum("channel").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    /** Resumo do atendimento — nunca a conversa inteira (minimização, LGPD). */
    summary: text("summary").notNull(),
    /** Trecho curto que justifica o resumo (opcional). */
    evidence: text("evidence"),
    ...origin(),
    ...timestamps,
  },
  (t) => [index("interactions_customer_idx").on(t.customerId, t.occurredAt)],
);

export const quotes = pgTable(
  "quotes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    vehicleId: uuid("vehicle_id").references(() => vehicles.id, { onDelete: "set null" }),
    description: text("description").notNull(),
    tireSize: text("tire_size"),
    quantity: integer("quantity"),
    total: money("total").notNull(),
    status: quoteStatusEnum("status").notNull().default("rascunho"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    validUntil: date("valid_until"),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    lossReason: text("loss_reason"),
    ...origin(),
    ...timestamps,
  },
  (t) => [index("quotes_customer_idx").on(t.customerId), index("quotes_status_idx").on(t.status)],
);

export const services = pgTable(
  "services",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    vehicleId: uuid("vehicle_id").references(() => vehicles.id, { onDelete: "set null" }),
    quoteId: uuid("quote_id").references(() => quotes.id, { onDelete: "set null" }),
    type: serviceTypeEnum("type").notNull(),
    description: text("description").notNull(),
    performedAt: timestamp("performed_at", { withTimezone: true }).notNull(),
    total: money("total"),
    km: integer("km"),
    ...origin(),
    ...timestamps,
  },
  (t) => [index("services_customer_idx").on(t.customerId, t.performedAt)],
);

export const appointments = pgTable(
  "appointments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    vehicleId: uuid("vehicle_id").references(() => vehicles.id, { onDelete: "set null" }),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    serviceType: serviceTypeEnum("service_type").notNull(),
    status: appointmentStatusEnum("status").notNull().default("agendado"),
    ...origin(),
    ...timestamps,
  },
  (t) => [index("appointments_scheduled_idx").on(t.scheduledAt)],
);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    type: taskTypeEnum("type").notNull(),
    title: text("title").notNull(),
    /** "Por quê" em linguagem simples, mostrado no card do painel Hoje. */
    reason: text("reason").notNull(),
    /** Dia da loja (America/Sao_Paulo). */
    dueDate: date("due_date").notNull(),
    status: taskStatusEnum("status").notNull().default("pendente"),
    snoozedCount: integer("snoozed_count").notNull().default(0),
    quoteId: uuid("quote_id").references(() => quotes.id, { onDelete: "set null" }),
    serviceId: uuid("service_id").references(() => services.id, { onDelete: "set null" }),
    appointmentId: uuid("appointment_id").references(() => appointments.id, {
      onDelete: "set null",
    }),
    /** Regra que gerou a tarefa (ex.: "R1"); nulo para tarefas manuais. */
    autoRule: text("auto_rule"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...origin(),
    ...timestamps,
  },
  (t) => [
    index("tasks_due_idx").on(t.status, t.dueDate),
    index("tasks_customer_idx").on(t.customerId),
    // Uma regra automática nunca gera duas tarefas para a mesma origem (idempotência, §7.1).
    // coalesce porque, no Postgres, NULL nunca é igual a NULL num índice único comum.
    uniqueIndex("tasks_auto_rule_unique")
      .on(
        t.autoRule,
        t.customerId,
        sql`coalesce(${t.quoteId}::text, '')`,
        sql`coalesce(${t.serviceId}::text, '')`,
        sql`coalesce(${t.appointmentId}::text, '')`,
      )
      .where(sql`${t.autoRule} is not null`),
  ],
);

export const agentEvents = pgTable(
  "agent_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Chave de idempotência enviada pelo agente: o mesmo evento nunca é aplicado duas vezes. */
    eventId: text("event_id").notNull().unique(),
    schemaVersion: text("schema_version").notNull(),
    type: text("type").notNull(),
    conversationId: text("conversation_id"),
    agentName: text("agent_name"),
    model: text("model"),
    promptVersion: text("prompt_version"),
    confidence: numeric("confidence", { precision: 3, scale: 2, mode: "number" }).notNull(),
    evidence: text("evidence"),
    payload: jsonb("payload").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    status: agentEventStatusEnum("status").notNull(),
    /** Ids criados ou erros do processamento. */
    result: jsonb("result"),
    customerId: uuid("customer_id").references((): AnyPgColumn => customers.id, {
      onDelete: "set null",
    }),
  },
  (t) => [index("agent_events_status_idx").on(t.status, t.receivedAt)],
);

export const reviewItems = pgTable(
  "review_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentEventId: uuid("agent_event_id")
      .notNull()
      .references(() => agentEvents.id, { onDelete: "cascade" }),
    reason: reviewReasonEnum("reason").notNull(),
    /** O que o agente propõe aplicar. */
    proposed: jsonb("proposed").notNull(),
    status: reviewStatusEnum("status").notNull().default("pendente"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("review_items_status_idx").on(t.status, t.createdAt)],
);

/** Gravado só pelo servidor, na mesma operação da mudança (§6). */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    action: auditActionEnum("action").notNull(),
    actorType: sourceEnum("actor_type").notNull(),
    agentEventId: uuid("agent_event_id").references(() => agentEvents.id, {
      onDelete: "set null",
    }),
    before: jsonb("before"),
    after: jsonb("after"),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_log_entity_idx").on(t.entityType, t.entityId, t.at)],
);
