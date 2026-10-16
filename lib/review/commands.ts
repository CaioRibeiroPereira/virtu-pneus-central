// Decisões do gestor na fila de revisão (§9 "Revisão"): aprovar, editar e aprovar, rejeitar.
// Aprovar reaproveita a mesma aplicação do processador automático (applyAgentEvent), agora com
// actor = gestor. Tudo numa transação, com auditoria da decisão e regras automáticas.
import { and, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { agentEvents, auditLog, customers, reviewItems } from "@/db/schema";
import { applyAgentEvent, resolveQuoteForStatusChange } from "@/lib/agent/apply";
import { agentEventSchema, type AgentEvent } from "@/lib/agent/schema";
import { storeDateOf, todayInStore } from "@/lib/dates";
import { editLabel } from "./fields";
import { normalizePhone } from "@/lib/phone";
import { syncAutoTasks } from "@/lib/rules/auto-tasks";
import { consumeForService, StockError, type ServiceItem } from "@/lib/oficina/inventory";

export type ApproveOptions = {
  /** Campos de `data` alterados pelo gestor ("editar e aprovar"). */
  editedData?: Record<string, unknown>;
  /** Para "cliente não encontrado": associar a um cliente existente... */
  customerId?: string;
  /** ...ou criar um cliente novo com o telefone da conversa. */
  createCustomerName?: string;
  note?: string;
  /** "Serviço feito": itens do estoque confirmados pelo gestor — baixa na mesma transação (D59). */
  stockItems?: ServiceItem[];
};

export type DecisionResult =
  | { ok: true; customerId: string | null }
  | {
      ok: false;
      reason:
        | "not_found"
        | "already_decided"
        | "needs_customer"
        | "invalid_edit"
        | "insufficient_stock"
        | "quote_not_found";
      message: string;
    };

/** Recusa depois de já ter gravado algo (ex.: cliente novo): lançar desfaz a transação inteira. */
class Refusal extends Error {
  constructor(readonly result: Extract<DecisionResult, { ok: false }>) {
    super(result.message);
  }
}

async function loadPending(tx: Db, reviewId: string) {
  const [row] = await tx
    .select({ review: reviewItems, event: agentEvents })
    .from(reviewItems)
    .innerJoin(agentEvents, eq(agentEvents.id, reviewItems.agentEventId))
    .where(eq(reviewItems.id, reviewId));
  return row;
}

export async function approveReview(
  db: Db,
  reviewId: string,
  options: ApproveOptions = {},
  today = todayInStore(),
): Promise<DecisionResult> {
  try {
    return await approveInTransaction(db, reviewId, options, today);
  } catch (error) {
    // Falta de estoque: a transação inteira foi desfeita (nem o serviço ficou); a sugestão
    // continua pendente e o gestor vê o motivo.
    if (error instanceof StockError) {
      return { ok: false, reason: "insufficient_stock", message: error.message };
    }
    if (error instanceof Refusal) return error.result;
    throw error;
  }
}

async function approveInTransaction(
  db: Db,
  reviewId: string,
  options: ApproveOptions,
  today: string,
): Promise<DecisionResult> {
  return db.transaction(async (tx) => {
    const row = await loadPending(tx, reviewId);
    if (!row) return { ok: false, reason: "not_found", message: "Sugestão não encontrada." };
    if (row.review.status !== "pendente") {
      return { ok: false, reason: "already_decided", message: "Esta sugestão já foi decidida." };
    }
    const proposed = row.review.proposed as { customerId?: string | null; quoteId?: string | null };

    // Monta o evento a aplicar (com as edições do gestor, validadas pelo mesmo contrato).
    const original = row.event.payload as AgentEvent;
    const edited = options.editedData && Object.keys(options.editedData).length > 0;
    const candidate = {
      ...original,
      data: {
        ...original.data,
        ...(original.type === "quote.status_changed" &&
        proposed.quoteId &&
        !("quote_id" in original.data && original.data.quote_id)
          ? { quote_id: proposed.quoteId }
          : {}),
        ...(options.editedData ?? {}),
      },
    };
    const parsed = agentEventSchema.safeParse(candidate);
    if (!parsed.success) {
      // Em português e com o nome do campo da tela (o zod fala inglês e usa o nome técnico).
      const fields = [
        ...new Set(
          parsed.error.issues.map((i) => editLabel(original.type, String(i.path[1] ?? ""))),
        ),
      ];
      return {
        ok: false,
        reason: "invalid_edit",
        message: `Confira: ${fields.join(", ")}.`,
      };
    }
    // As mesmas regras de data que valem quando o gestor registra pela ficha.
    const data = parsed.data;
    if (
      data.type === "appointment.requested" &&
      storeDateOf(new Date(data.data.scheduled_at)) < today
    ) {
      return {
        ok: false,
        reason: "invalid_edit",
        message: "O dia do agendamento já passou: corrija em “Editar e aprovar” ou rejeite.",
      };
    }
    if (
      data.type === "service.completed" &&
      storeDateOf(new Date(data.data.performed_at)) > today
    ) {
      return {
        ok: false,
        reason: "invalid_edit",
        message: "Serviço feito não pode ter data futura: corrija em “Editar e aprovar”.",
      };
    }

    // Cliente: o casado pelo telefone, o escolhido pelo gestor ou um novo.
    let customerId = options.customerId ?? proposed.customerId ?? row.event.customerId ?? null;
    if (!customerId && options.createCustomerName) {
      const phone = normalizePhone(original.customer.phone);
      const [created] = await tx
        .insert(customers)
        .values({
          name: options.createCustomerName,
          phoneE164: phone?.e164 ?? null,
          phoneDisplay: phone?.display ?? original.customer.phone,
          source: "gestor",
          humanEditedFields: ["name"],
        })
        .returning({ id: customers.id });
      customerId = created.id;
      await tx.insert(auditLog).values({
        entityType: "customer",
        entityId: created.id,
        action: "create",
        actorType: "gestor",
        agentEventId: row.event.id,
        after: { name: options.createCustomerName, origem: "fila de revisão" },
      });
    }
    if (!customerId) {
      return {
        ok: false,
        reason: "needs_customer",
        message: "Escolha um cliente existente ou crie um novo para aprovar.",
      };
    }
    // Aprovação/recusa de orçamento sem orçamento em aberto (já decidido na ficha, por exemplo):
    // avisa em vez de quebrar a tela.
    if (
      data.type === "quote.status_changed" &&
      !(await resolveQuoteForStatusChange(tx, customerId, data.data.quote_id))
    ) {
      throw new Refusal({
        ok: false,
        reason: "quote_not_found",
        message:
          "Este cliente não tem orçamento aguardando resposta (talvez já tenha sido decidido na ficha). Rejeite a sugestão ou registre o orçamento antes.",
      });
    }

    const applied = await applyAgentEvent(tx, parsed.data, {
      customerId,
      agentEventId: row.event.id,
      actor: "gestor",
      // Em conflito com edição humana, aprovar significa aceitar o valor do agente.
      overwrite: row.review.reason === "conflito_edicao_humana",
      today,
    });
    // "Serviço feito" vindo do Vito: o gestor confirmou quais itens saíram do estoque.
    const stockItems = parsed.data.type === "service.completed" ? (options.stockItems ?? []) : [];
    const service = applied.find((a) => a.entity === "service");
    if (stockItems.length && service) await consumeForService(tx, service.id, stockItems);

    const status = edited ? "aprovado_editado" : "aprovado";
    await tx
      .update(reviewItems)
      .set({ status, decidedAt: new Date(), note: options.note ?? null })
      .where(and(eq(reviewItems.id, reviewId), eq(reviewItems.status, "pendente")));
    await tx
      .update(agentEvents)
      .set({
        status: "aplicado",
        customerId,
        result: { applied, decided_by: "gestor", review: status },
      })
      .where(eq(agentEvents.id, row.event.id));
    await tx.insert(auditLog).values({
      entityType: "review_item",
      entityId: reviewId,
      action: "review_decision",
      actorType: "gestor",
      agentEventId: row.event.id,
      before: { status: "pendente" },
      after: {
        status,
        ...(edited ? { edicoes: options.editedData } : {}),
        ...(stockItems.length ? { itens_estoque: stockItems } : {}),
        note: options.note ?? null,
      },
    });
    await syncAutoTasks(tx, today, { customerId });
    return { ok: true, customerId };
  });
}

export async function rejectReview(
  db: Db,
  reviewId: string,
  note?: string,
): Promise<DecisionResult> {
  return db.transaction(async (tx) => {
    const row = await loadPending(tx, reviewId);
    if (!row) return { ok: false, reason: "not_found", message: "Sugestão não encontrada." };
    if (row.review.status !== "pendente") {
      return { ok: false, reason: "already_decided", message: "Esta sugestão já foi decidida." };
    }
    await tx
      .update(reviewItems)
      .set({ status: "rejeitado", decidedAt: new Date(), note: note ?? null })
      .where(eq(reviewItems.id, reviewId));
    await tx
      .update(agentEvents)
      .set({ status: "rejeitado", result: { decided_by: "gestor", review: "rejeitado" } })
      .where(eq(agentEvents.id, row.event.id));
    await tx.insert(auditLog).values({
      entityType: "review_item",
      entityId: reviewId,
      action: "review_decision",
      actorType: "gestor",
      agentEventId: row.event.id,
      before: { status: "pendente" },
      after: { status: "rejeitado", note: note ?? null },
    });
    return { ok: true, customerId: row.event.customerId };
  });
}
