// Edição do cliente pelo gestor: trava otimista (409), campos protegidos contra o agente e auditoria.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { auditLog, customers } from "@/db/schema";
import { updateCustomerByGestor } from "@/lib/customers/update";
import { handleAgentEvent } from "@/lib/agent/handler";
import { createTestDb } from "../helpers/db";

let db: Db;
let close: () => Promise<void>;
let id: string;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  const [c] = await db
    .insert(customers)
    .values({
      name: "Ana Souza",
      phoneE164: "+5519955554444",
      phoneDisplay: "(19) 95555-4444",
      isProvisional: true,
    })
    .returning();
  id = c.id;
  await db.insert(customers).values({ name: "Outro", phoneE164: "+5519911112222" });
});
afterAll(() => close());

describe("updateCustomerByGestor", () => {
  it("grava, sobe a versão, registra campos editados, confirma o provisório e audita", async () => {
    const result = await updateCustomerByGestor(db, id, 1, {
      city: "Campinas",
      notes: "Prefere manhã",
    });
    expect(result).toEqual({ ok: true, version: 2, changed: ["city", "notes"] });
    const [c] = await db.select().from(customers).where(eq(customers.id, id));
    expect(c.humanEditedFields).toEqual(expect.arrayContaining(["city", "notes"]));
    expect(c.isProvisional).toBe(false);
    const audits = await db.select().from(auditLog).where(eq(auditLog.entityId, id));
    expect(audits.at(-1)).toMatchObject({ actorType: "gestor", action: "update" });
  });

  it("versão desatualizada → conflito (409), devolvendo o dado atual, sem gravar", async () => {
    const result = await updateCustomerByGestor(db, id, 1, { city: "Sumaré" });
    expect(result.ok).toBe(false);
    if (!result.ok && result.reason === "conflict") expect(result.current.city).toBe("Campinas");
    else throw new Error("esperava conflito");
  });

  it("telefone inválido ou de outro cliente é recusado", async () => {
    expect(await updateCustomerByGestor(db, id, 2, { phone: "123" })).toEqual({
      ok: false,
      reason: "invalid_phone",
    });
    const dup = await updateCustomerByGestor(db, id, 2, { phone: "(19) 91111-2222" });
    expect(dup).toMatchObject({ ok: false, reason: "duplicate_phone" });
  });

  it("'perdido' exige motivo", async () => {
    expect(await updateCustomerByGestor(db, id, 2, { stage: "perdido" })).toEqual({
      ok: false,
      reason: "loss_reason_required",
    });
  });

  it("depois que o gestor edita a cidade, o agente não a sobrescreve: vai para revisão", async () => {
    const res = await handleAgentEvent(
      {
        authorization: "Bearer t",
        contentType: "application/json",
        body: JSON.stringify({
          schema_version: "1.0",
          event_id: "conflito-depois-da-edicao",
          type: "customer.upserted",
          occurred_at: "2026-10-14T10:00:00-03:00",
          source: { channel: "whatsapp", conversation_id: "c1", message_ids: [] },
          agent: { name: "vito", model: "gemini", prompt_version: "1" },
          confidence: 0.95,
          customer: { phone: "19955554444" },
          data: { city: "Indaiatuba" },
        }),
      },
      { token: "t", threshold: 0.85, withDb: (fn) => fn(db) },
    );
    expect(res.status).toBe(202);
    expect(res.body.reason).toBe("conflito_edicao_humana");
    const [c] = await db.select().from(customers).where(eq(customers.id, id));
    expect(c.city).toBe("Campinas");
  });
});
