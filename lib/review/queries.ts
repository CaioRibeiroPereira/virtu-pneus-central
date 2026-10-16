// Leitura da fila de revisão com o "dado atual" ao lado da proposta (§9).
import { asc, desc, eq, inArray, ne } from "drizzle-orm";
import type { Db } from "@/db";
import { agentEvents, customers, quotes, reviewItems } from "@/db/schema";
import type { AgentEvent } from "@/lib/agent/schema";
import { formatDate, formatDateTime } from "@/lib/dates";
import {
  channelLabel,
  formatMoney,
  originLabel,
  quoteStatusLabel,
  serviceTypeLabel,
  taskTypeLabel,
} from "@/lib/labels";
import { normalizePhone } from "@/lib/phone";

export type Comparison = { field: string; current: string; proposed: string };

export type ReviewCard = {
  id: string;
  reason: string;
  createdAt: Date;
  event: {
    type: string;
    confidence: number;
    evidence: string | null;
    receivedAt: Date;
    agentName: string | null;
  };
  data: Record<string, unknown>;
  phone: string;
  customer: { id: string; name: string } | null;
  comparison: Comparison[];
};

const FIELD_LABEL: Record<string, string> = {
  name: "Nome",
  email: "E-mail",
  city: "Cidade",
  origin: "Origem",
  status: "Situação do orçamento",
  description: "Descrição",
  total: "Valor",
  summary: "Resumo",
  type: "Tipo",
  performed_at: "Data do serviço",
  scheduled_at: "Dia e horário",
  service_type: "Serviço",
  title: "Título",
  reason: "Motivo",
  due_date: "Quando",
  plate: "Placa",
  model: "Modelo",
  tire_size: "Medida",
  channel: "Canal",
  quantity: "Quantidade",
  year: "Ano",
  km: "Quilometragem",
  valid_until: "Válido até",
};

export const fieldLabel = (f: string) => FIELD_LABEL[f] ?? f;

/** Valor como o dono lê: dinheiro, datas no relógio da loja e rótulos em vez de códigos. */
function show(field: string, value: unknown, eventType = ""): string {
  if (value === null || value === undefined || value === "") return "—";
  const text = String(value);
  if (field === "total" && typeof value === "number") return formatMoney(value);
  if (field === "origin") return originLabel[text] ?? text;
  if (field === "status") return quoteStatusLabel[text] ?? text;
  if (field === "channel") return channelLabel[text] ?? text;
  if (field === "type" && eventType === "task.suggested") return taskTypeLabel[text] ?? text;
  if (field === "service_type" || field === "type") return serviceTypeLabel[text] ?? text;
  if (field === "scheduled_at" || field === "performed_at") {
    const at = new Date(text);
    return Number.isNaN(at.getTime()) ? text : formatDateTime(at);
  }
  if ((field === "due_date" || field === "valid_until") && /^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return formatDate(text);
  }
  return text;
}

export async function listPendingReviews(db: Db): Promise<ReviewCard[]> {
  const rows = await db
    .select({ review: reviewItems, event: agentEvents })
    .from(reviewItems)
    .innerJoin(agentEvents, eq(agentEvents.id, reviewItems.agentEventId))
    .where(eq(reviewItems.status, "pendente"))
    .orderBy(asc(reviewItems.createdAt));

  const customerIds = [
    ...new Set(rows.map((r) => r.event.customerId).filter((x): x is string => !!x)),
  ];
  const customerRows = customerIds.length
    ? await db.select().from(customers).where(inArray(customers.id, customerIds))
    : [];
  const byId = new Map(customerRows.map((c) => [c.id, c]));
  const quoteIds = rows
    .map(
      (r) =>
        (r.review.proposed as { quoteId?: string | null }).quoteId ??
        ((r.event.payload as AgentEvent).data as { quote_id?: string }).quote_id,
    )
    .filter((x): x is string => !!x);
  const quoteRows = quoteIds.length
    ? await db.select().from(quotes).where(inArray(quotes.id, quoteIds))
    : [];
  const quoteById = new Map(quoteRows.map((q) => [q.id, q]));

  return rows.map(({ review, event }) => {
    const payload = event.payload as AgentEvent;
    const data = payload.data as Record<string, unknown>;
    const customer = event.customerId ? byId.get(event.customerId) : undefined;
    const proposed = review.proposed as { quoteId?: string | null };
    const targetQuote =
      proposed.quoteId ?? (typeof data.quote_id === "string" ? data.quote_id : null);

    let comparison: Comparison[];
    if (payload.type === "customer.upserted" && customer) {
      comparison = Object.keys(data).map((f) => ({
        field: fieldLabel(f),
        current: show(f, customer[f as "name" | "email" | "city" | "origin"]),
        proposed: show(f, data[f]),
      }));
    } else if (payload.type === "quote.status_changed") {
      const q = targetQuote ? quoteById.get(targetQuote) : undefined;
      comparison = [
        {
          field: "Orçamento",
          current: q ? `${q.description} · ${formatMoney(q.total)}` : "não encontrado",
          proposed: q ? `${q.description} · ${formatMoney(q.total)}` : "—",
        },
        {
          field: fieldLabel("status"),
          current: show("status", q?.status),
          proposed: show("status", data.status),
        },
      ];
    } else {
      // Tipos que criam registro novo: não há "dado atual".
      comparison = Object.entries(data)
        .filter(([f]) => f !== "quote_id")
        .map(([f, v]) => ({
          field: fieldLabel(f),
          current: "— (novo registro)",
          proposed: show(f, v, payload.type),
        }));
    }

    return {
      id: review.id,
      reason: review.reason,
      createdAt: review.createdAt,
      event: {
        type: event.type,
        confidence: event.confidence,
        evidence: event.evidence,
        receivedAt: event.receivedAt,
        agentName: event.agentName,
      },
      data,
      phone: normalizePhone(payload.customer.phone)?.display ?? payload.customer.phone,
      customer: customer ? { id: customer.id, name: customer.name } : null,
      comparison,
    };
  });
}

export async function recentDecisions(db: Db, limit = 8) {
  return db
    .select({
      id: reviewItems.id,
      status: reviewItems.status,
      decidedAt: reviewItems.decidedAt,
      type: agentEvents.type,
      customerName: customers.name,
      customerId: customers.id,
    })
    .from(reviewItems)
    .innerJoin(agentEvents, eq(agentEvents.id, reviewItems.agentEventId))
    .leftJoin(customers, eq(customers.id, agentEvents.customerId))
    .where(ne(reviewItems.status, "pendente"))
    .orderBy(desc(reviewItems.decidedAt))
    .limit(limit);
}

/** Lista curta de clientes para "associar a um cliente existente". */
export async function customerOptions(db: Db) {
  return db
    .select({ id: customers.id, name: customers.name, phone: customers.phoneDisplay })
    .from(customers)
    .orderBy(asc(customers.name));
}
