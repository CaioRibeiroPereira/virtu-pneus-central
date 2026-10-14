// Contrato dos eventos enviados pelos agentes de IA (§8.1 e §8.2).
// Um envelope comum + `data` específico de cada `type` (união discriminada).
// Os tipos TypeScript saem do schema (z.infer): uma única fonte de verdade.
import { z } from "zod";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const dateOnly = z.string().regex(DATE_ONLY, "use o formato AAAA-MM-DD");
const instant = z.iso.datetime({ offset: true });
const shortText = (max: number) => z.string().trim().min(1).max(max);

const serviceType = z.enum([
  "troca_pneus",
  "alinhamento",
  "balanceamento",
  "rodizio",
  "reparo",
  "outro",
]);

export const MAX_BODY_BYTES = 64 * 1024;

const envelope = {
  schema_version: z.literal("1.0"),
  event_id: z.string().min(8).max(128),
  occurred_at: instant,
  source: z.object({
    channel: z.literal("whatsapp"),
    conversation_id: z.string().min(1).max(128),
    message_ids: z.array(z.string().max(128)).max(50).default([]),
  }),
  agent: z.object({
    name: z.string().min(1).max(64),
    model: z.string().min(1).max(64),
    prompt_version: z.string().min(1).max(64),
  }),
  confidence: z.number().min(0).max(1),
  evidence: z.string().max(500).optional(),
  customer: z.object({
    phone: z.string().min(1).max(40),
    name: z.string().trim().max(120).optional(),
  }),
};

const event = <T extends string, D extends z.ZodTypeAny>(type: T, data: D) =>
  z.object({ ...envelope, type: z.literal(type), data });

export const agentEventSchema = z.discriminatedUnion("type", [
  event(
    "customer.upserted",
    z.object({
      name: shortText(120).optional(),
      email: z.email().optional(),
      city: shortText(80).optional(),
      origin: z
        .enum(["whatsapp", "indicacao", "balcao", "instagram", "google", "outro"])
        .optional(),
    }),
  ),
  event(
    "vehicle.identified",
    z.object({
      plate: z.string().max(10).optional(),
      model: shortText(80).optional(),
      year: z.number().int().min(1950).max(2100).optional(),
      tire_size: shortText(30).optional(),
    }),
  ),
  event(
    "interaction.logged",
    z.object({ summary: shortText(1000), channel: z.enum(["whatsapp", "telefone", "balcao"]) }),
  ),
  event(
    "quote.created",
    z.object({
      description: shortText(500),
      total: z.number().nonnegative().max(1_000_000),
      tire_size: shortText(30).optional(),
      quantity: z.number().int().positive().max(100).optional(),
      valid_until: dateOnly.optional(),
      vehicle_plate: z.string().max(10).optional(),
    }),
  ),
  event(
    "task.suggested",
    z.object({
      type: z.enum([
        "retorno_comercial",
        "followup_orcamento",
        "pos_venda",
        "confirmar_agendamento",
        "outro",
      ]),
      title: shortText(120),
      reason: shortText(300),
      due_date: dateOnly,
    }),
  ),
  event("appointment.requested", z.object({ scheduled_at: instant, service_type: serviceType })),
  event(
    "quote.status_changed",
    z.object({
      status: z.enum(["aprovado", "recusado"]),
      reason: shortText(300).optional(),
      quote_id: z.uuid().optional(),
    }),
  ),
  event(
    "service.completed",
    z.object({
      type: serviceType,
      description: shortText(500),
      performed_at: instant,
      total: z.number().nonnegative().max(1_000_000).optional(),
      km: z.number().int().nonnegative().max(5_000_000).optional(),
    }),
  ),
]);

export type AgentEvent = z.infer<typeof agentEventSchema>;
export type AgentEventType = AgentEvent["type"];

/** Tipos que mexem com dinheiro ou histórico de serviço: sempre passam pelo gestor (D6). */
export const HIGH_RISK_TYPES: ReadonlySet<AgentEventType> = new Set([
  "quote.status_changed",
  "service.completed",
]);
