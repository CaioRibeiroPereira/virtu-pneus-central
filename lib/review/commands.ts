// Decisões do gestor na fila de revisão (§9 "Revisão"): aprovar, editar e aprovar, rejeitar.
// Aprovar reaproveita a mesma aplicação do processador automático (applyAgentEvent), agora com
// actor = gestor. Tudo numa transação, com auditoria da decisão e regras automáticas.
import { and, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { agentEvents, auditLog, customers, reviewItems } from "@/db/schema";
import { applyAgentEvent } from "@/lib/agent/apply";
import { agentEventSchema, type AgentEvent } from "@/lib/agent/schema";
import { todayInStore } from "@/lib/dates";
import { normalizePhone } from "@/lib/phone";
import { syncAutoTasks } from "@/lib/rules/auto-tasks";

export type ApproveOptions = {
  /** Campos de `data` alterados pelo gestor ("editar e aprovar"). */
  editedData?: Record<string, unknown>;
  /** Para "cliente não encontrado": associar a um cliente existente... */
  customerId?: string;
  /** ...ou criar um cliente novo com o telefone da conversa. */
  createCustomerName?: string;
  note?: string;
};

export type DecisionResult =
  | { ok: true; customerId: string | null }
  | {
      ok: false;
      reason: "not_found" | "already_decided" | "needs_customer" | "invalid_edit";
      message: string;
    };

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
      return {
        ok: false,
        reason: "invalid_edit",
        message: parsed.error.issues
          .map((i) => `${i.path.slice(1).join(".")}: ${i.message}`)
          .join("; "),
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

    const applied = await applyAgentEvent(tx, parsed.data, {
      customerId,
      agentEventId: row.event.id,
      actor: "gestor",
      // Em conflito com edição humana, aprovar significa aceitar o valor do agente.
      overwrite: row.review.reason === "conflito_edicao_humana",
    });

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
