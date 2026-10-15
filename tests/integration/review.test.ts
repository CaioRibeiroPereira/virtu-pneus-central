// Fila de revisão sobre o seed: aprovar, editar e aprovar, associar cliente, rejeitar.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import type { Db } from "@/db";
import {
  agentEvents,
  auditLog,
  customers,
  interactions,
  quotes,
  reviewItems,
  tasks,
} from "@/db/schema";
import { resetDemoData } from "@/db/reset";
import { approveReview, rejectReview } from "@/lib/review/commands";
import { createTestDb } from "../helpers/db";

const TODAY = "2026-10-14";
let db: Db;
let close: () => Promise<void>;

const reviewByReason = async (reason: string) => {
  const [r] = await db
    .select()
    .from(reviewItems)
    .where(and(eq(reviewItems.reason, reason as never), eq(reviewItems.status, "pendente")));
  return r;
};

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await resetDemoData(db, TODAY);
});
afterAll(() => close());

describe("aprovar", () => {
  it("alto impacto: aprova o orçamento, cancela o follow-up R1 e audita a decisão", async () => {
    const review = await reviewByReason("alto_impacto");
    const { quoteId } = review.proposed as { quoteId: string };
    const result = await approveReview(db, review.id, {}, TODAY);
    expect(result.ok).toBe(true);

    const [q] = await db.select().from(quotes).where(eq(quotes.id, quoteId));
    expect(q.status).toBe("aprovado");
    const [r1] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.quoteId, quoteId), eq(tasks.autoRule, "R1")));
    expect(r1.status).toBe("cancelada");
    const [after] = await db.select().from(reviewItems).where(eq(reviewItems.id, review.id));
    expect(after.status).toBe("aprovado");
    const [ev] = await db.select().from(agentEvents).where(eq(agentEvents.id, review.agentEventId));
    expect(ev.status).toBe("aplicado");
    const decisions = await db.select().from(auditLog).where(eq(auditLog.entityId, review.id));
    expect(decisions[0]).toMatchObject({ action: "review_decision", actorType: "gestor" });
  });

  it("não deixa decidir duas vezes", async () => {
    const [decided] = await db.select().from(reviewItems).where(eq(reviewItems.status, "aprovado"));
    expect(await approveReview(db, decided.id, {}, TODAY)).toMatchObject({
      ok: false,
      reason: "already_decided",
    });
  });

  it("conflito com edição humana: aprovar aceita o valor do agente", async () => {
    const review = await reviewByReason("conflito_edicao_humana");
    expect((await approveReview(db, review.id, {}, TODAY)).ok).toBe(true);
    const [marcos] = await db.select().from(customers).where(eq(customers.name, "Marcos Oliveira"));
    expect(marcos.city).toBe("Hortolândia");
  });
});

describe("cliente não encontrado / baixa confiança", () => {
  it("exige escolher um cliente; edição inválida é recusada; criar cliente novo aplica", async () => {
    const review = await reviewByReason("baixa_confianca");
    expect(await approveReview(db, review.id, {}, TODAY)).toMatchObject({
      ok: false,
      reason: "needs_customer",
    });

    const invalid = await approveReview(
      db,
      review.id,
      { createCustomerName: "X", editedData: { channel: "fax" } },
      TODAY,
    );
    expect(invalid).toMatchObject({ ok: false, reason: "invalid_edit" });

    const ok = await approveReview(
      db,
      review.id,
      {
        createCustomerName: "Cliente Aro 15",
        editedData: { summary: "Quer pneus aro 15 para um Gol" },
      },
      TODAY,
    );
    expect(ok.ok).toBe(true);
    const [c] = await db.select().from(customers).where(eq(customers.name, "Cliente Aro 15"));
    expect(c.phoneE164).toBe("+5519900000099");
    const [i] = await db.select().from(interactions).where(eq(interactions.customerId, c.id));
    expect(i.summary).toBe("Quer pneus aro 15 para um Gol");
    const [after] = await db.select().from(reviewItems).where(eq(reviewItems.id, review.id));
    expect(after.status).toBe("aprovado_editado");
  });
});

describe("rejeitar", () => {
  it("marca como rejeitado e não altera nada", async () => {
    const [ricardo] = await db.select().from(customers).where(eq(customers.name, "Ricardo Alves"));
    // Cria uma sugestão nova para rejeitar (o seed já teve as 3 decididas acima).
    const [ev] = await db
      .insert(agentEvents)
      .values({
        eventId: "rejeitar-teste-0001",
        schemaVersion: "1.0",
        type: "customer.upserted",
        confidence: 0.5,
        payload: {
          schema_version: "1.0",
          event_id: "rejeitar-teste-0001",
          type: "customer.upserted",
          occurred_at: "2026-10-14T10:00:00-03:00",
          source: { channel: "whatsapp", conversation_id: "c", message_ids: [] },
          agent: { name: "v", model: "m", prompt_version: "1" },
          confidence: 0.5,
          customer: { phone: "(19) 90000-0001" },
          data: { city: "Valinhos" },
        },
        status: "em_revisao",
        customerId: ricardo.id,
      })
      .returning();
    const [review] = await db
      .insert(reviewItems)
      .values({
        agentEventId: ev.id,
        reason: "baixa_confianca",
        proposed: { customerId: ricardo.id },
      })
      .returning();

    expect((await rejectReview(db, review.id, "Cliente mora em Campinas")).ok).toBe(true);
    const [after] = await db.select().from(reviewItems).where(eq(reviewItems.id, review.id));
    expect(after).toMatchObject({ status: "rejeitado", note: "Cliente mora em Campinas" });
    const [c] = await db.select().from(customers).where(eq(customers.id, ricardo.id));
    expect(c.city).toBe("Campinas");
  });
});
