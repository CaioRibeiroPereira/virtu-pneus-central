// Pipeline de processamento de um evento do agente (§8.3), dentro de UMA transação:
//   3. idempotência (event_id único)  4. matching por telefone  5. decisão (aplicar ou revisar)
//   6. aplicação + auditoria + regras automáticas.
// Se qualquer passo falhar, nada fica gravado pela metade (rollback) e o n8n pode reenviar.
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { agentEvents, auditLog, customers, reviewItems } from "@/db/schema";
import { todayInStore, type DateOnly } from "@/lib/dates";
import { normalizePhone } from "@/lib/phone";
import { syncAutoTasks } from "@/lib/rules/auto-tasks";
import {
  applyAgentEvent,
  diffCustomerFields,
  resolveQuoteForStatusChange,
  type AppliedEntity,
} from "./apply";
import { HIGH_RISK_TYPES, type AgentEvent } from "./schema";

export type ReviewReason =
  | "baixa_confianca"
  | "cliente_nao_encontrado"
  | "varios_clientes"
  | "conflito_edicao_humana"
  | "alto_impacto";

export type ProcessOutcome =
  | { status: "applied"; eventId: string; applied: AppliedEntity[]; customerId: string }
  | { status: "queued_for_review"; eventId: string; reviewId: string; reason: ReviewReason }
  | { status: "duplicate"; eventId: string };

export type ProcessOptions = {
  /** Confiança mínima para aplicar sozinho (AGENT_AUTO_APPLY_THRESHOLD, padrão 0,85). */
  threshold: number;
  today?: DateOnly;
};

export async function processAgentEvent(
  db: Db,
  event: AgentEvent,
  options: ProcessOptions,
): Promise<ProcessOutcome> {
  const today = options.today ?? todayInStore();

  return db.transaction(async (tx) => {
    // 3. Idempotência: se o event_id já existe, nada é feito.
    const [stored] = await tx
      .insert(agentEvents)
      .values({
        eventId: event.event_id,
        schemaVersion: event.schema_version,
        type: event.type,
        conversationId: event.source.conversation_id,
        agentName: event.agent.name,
        model: event.agent.model,
        promptVersion: event.agent.prompt_version,
        confidence: event.confidence,
        evidence: event.evidence ?? null,
        payload: event,
        receivedAt: new Date(),
        status: "em_revisao", // provisório; atualizado no fim desta transação
      })
      .onConflictDoNothing({ target: agentEvents.eventId })
      .returning({ id: agentEvents.id });
    if (!stored) return { status: "duplicate", eventId: event.event_id };

    const highRisk = HIGH_RISK_TYPES.has(event.type);
    const confident = event.confidence >= options.threshold;

    async function sendToReview(
      reason: ReviewReason,
      customerId: string | null,
      extra: object = {},
    ) {
      const [review] = await tx
        .insert(reviewItems)
        .values({
          agentEventId: stored.id,
          reason,
          proposed: {
            type: event.type,
            data: event.data,
            customer: event.customer,
            customerId,
            ...extra,
          },
        })
        .returning({ id: reviewItems.id });
      await tx
        .update(agentEvents)
        .set({ status: "em_revisao", customerId, result: { review_id: review.id, reason } })
        .where(eq(agentEvents.id, stored.id));
      return {
        status: "queued_for_review" as const,
        eventId: event.event_id,
        reviewId: review.id,
        reason,
      };
    }

    // 4. Matching pelo telefone normalizado (E.164).
    const phone = normalizePhone(event.customer.phone);
    const matches = phone
      ? await tx.select().from(customers).where(eq(customers.phoneE164, phone.e164))
      : [];
    // O índice único em phone_e164 impede duplicatas; o caso fica por robustez.
    if (matches.length > 1) return sendToReview("varios_clientes", null);

    let customer = matches[0];
    if (!customer) {
      // 0 clientes: cria um provisório só se for de baixo risco e confiável; senão, gestor decide.
      if (highRisk || !confident || !phone) return sendToReview("cliente_nao_encontrado", null);
      const name =
        event.customer.name ||
        (event.type === "customer.upserted" ? event.data.name : undefined) ||
        `Contato ${phone.display}`;
      [customer] = await tx
        .insert(customers)
        .values({
          name,
          phoneE164: phone.e164,
          phoneDisplay: phone.display,
          isProvisional: true,
          source: "agente",
          agentEventId: stored.id,
        })
        .returning();
      await tx.insert(auditLog).values({
        entityType: "customer",
        entityId: customer.id,
        action: "create",
        actorType: "agente",
        agentEventId: stored.id,
        after: { name, provisional: true },
      });
    }

    // 5. Decisão.
    if (highRisk) {
      const target =
        event.type === "quote.status_changed"
          ? { quoteId: await resolveQuoteForStatusChange(tx, customer.id, event.data.quote_id) }
          : {};
      return sendToReview("alto_impacto", customer.id, target);
    }
    if (!confident) return sendToReview("baixa_confianca", customer.id);
    if (event.type === "customer.upserted") {
      const { conflicts } = diffCustomerFields(customer, event.data);
      if (conflicts.length) {
        return sendToReview("conflito_edicao_humana", customer.id, {
          conflicts,
          current: Object.fromEntries(conflicts.map((f) => [f, customer[f]])),
        });
      }
    }

    // 6. Aplicação, auditoria e regras automáticas — tudo nesta mesma transação.
    const applied = await applyAgentEvent(tx, event, {
      customerId: customer.id,
      agentEventId: stored.id,
      actor: "agente",
    });
    await tx
      .update(agentEvents)
      .set({ status: "aplicado", customerId: customer.id, result: { applied } })
      .where(eq(agentEvents.id, stored.id));
    await syncAutoTasks(tx, today, { customerId: customer.id, agentEventId: stored.id });

    return { status: "applied", eventId: event.event_id, applied, customerId: customer.id };
  });
}
