// Corrigir/excluir orçamento e serviço e exclusão de cliente (LGPD) em Postgres de verdade (D64).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import type { Db } from "@/db";
import {
  agentEvents,
  auditLog,
  customers,
  products,
  quotes,
  reviewItems,
  services,
  stockMovements,
  tasks,
  telegramChats,
  telegramMessages,
} from "@/db/schema";
import { addQuote, addService, setTaskStatus } from "@/lib/customers/commands";
import { deleteQuote, deleteService, updateQuote, updateService } from "@/lib/customers/records";
import { eraseCustomer } from "@/lib/customers/erase";
import { processAgentEvent } from "@/lib/agent/process";
import { agentEventSchema } from "@/lib/agent/schema";
import { createProduct } from "@/lib/oficina/inventory";
import { createTestDb } from "../helpers/db";

const TODAY = "2026-10-16";
let db: Db;
let close: () => Promise<void>;
let seq = 0;

async function newCustomer() {
  seq += 1;
  const n = String(seq).padStart(2, "0");
  const [c] = await db
    .insert(customers)
    .values({
      name: `Pessoa ${n}`,
      phoneE164: `+55199000004${n}`,
      phoneDisplay: `(19) 90000-04${n}`,
    })
    .returning();
  return c;
}
const autoTasks = (where: ReturnType<typeof eq>) => db.select().from(tasks).where(where);

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());

describe("orçamento", () => {
  it("corrigir o valor refaz o follow-up com o valor novo", async () => {
    const c = await newCustomer();
    await addQuote(db, c.id, { description: "4 pneus", total: 1.84 }, TODAY);
    const [q] = await db.select().from(quotes).where(eq(quotes.customerId, c.id));
    await updateQuote(db, q.id, { description: "4 pneus aro 15", total: 1840 }, TODAY);
    const r1 = (await autoTasks(eq(tasks.quoteId, q.id))).filter((t) => t.status === "pendente");
    expect(r1).toHaveLength(1);
    expect(r1[0].reason).toMatch(/R\$\s1\.840,00/);
    expect((await db.select().from(quotes).where(eq(quotes.id, q.id)))[0].description).toBe(
      "4 pneus aro 15",
    );
  });

  it("excluir: o follow-up pendente sai; o já feito fica no histórico; dois excluídos não colidem", async () => {
    const c = await newCustomer();
    for (const total of [500, 700])
      await addQuote(db, c.id, { description: "Pneus", total }, TODAY);
    const qs = await db.select().from(quotes).where(eq(quotes.customerId, c.id));
    for (const q of qs) {
      const [r1] = await autoTasks(eq(tasks.quoteId, q.id));
      await setTaskStatus(db, r1.id, "concluida");
    }
    for (const q of qs) await deleteQuote(db, q.id, TODAY);
    expect(await db.select().from(quotes).where(eq(quotes.customerId, c.id))).toEqual([]);
    const left = await autoTasks(eq(tasks.customerId, c.id));
    expect(left.map((t) => [t.status, t.autoRule])).toEqual([
      ["concluida", null],
      ["concluida", null],
    ]);
  });
});

describe("serviço", () => {
  it("corrigir a data refaz o pós-venda com a data certa", async () => {
    const c = await newCustomer();
    await addService(
      db,
      c.id,
      { type: "balanceamento", description: "Balanceamento", date: TODAY },
      TODAY,
    );
    const [s] = await db.select().from(services).where(eq(services.customerId, c.id));
    await updateService(
      db,
      s.id,
      { type: "balanceamento", description: "Balanceamento", date: "2026-10-12" },
      TODAY,
    );
    const [r2] = await autoTasks(and(eq(tasks.serviceId, s.id), eq(tasks.autoRule, "R2"))!);
    expect(r2.dueDate).toBe("2026-10-19");
  });

  it("excluir devolve ao estoque o que o serviço tinha baixado", async () => {
    const c = await newCustomer();
    const pneu = await createProduct(db, {
      kind: "pneu",
      name: "Pneu X",
      tireSize: "175/70 R14",
      price: 300,
      minQuantity: 1,
      quantity: 6,
    });
    await addService(
      db,
      c.id,
      {
        type: "troca_pneus",
        description: "Troca",
        date: TODAY,
        items: [{ productId: pneu, quantity: 4 }],
      },
      TODAY,
    );
    const [s] = await db.select().from(services).where(eq(services.customerId, c.id));
    expect((await db.select().from(products).where(eq(products.id, pneu)))[0].quantity).toBe(2);
    const r = await deleteService(db, s.id, TODAY);
    expect(r.returnedItems).toBe(1);
    expect((await db.select().from(products).where(eq(products.id, pneu)))[0].quantity).toBe(6);
    const moves = await db.select().from(stockMovements).where(eq(stockMovements.productId, pneu));
    expect(moves.map((m) => [m.kind, m.quantity]).sort()).toEqual(
      [
        ["ajuste", 4],
        ["entrada", 6],
        ["saida_servico", -4],
      ].sort(),
    );
    expect(
      (await autoTasks(eq(tasks.customerId, c.id))).filter((t) => t.status === "pendente"),
    ).toEqual([]);
  });
});

describe("exclusão de cliente (LGPD)", () => {
  it("apaga o cliente e todo dado pessoal dele; fica só o registro da exclusão", async () => {
    const c = await newCustomer();
    const other = await newCustomer();
    const event = (n: string, type: string, data: Record<string, unknown>, confidence = 0.95) =>
      agentEventSchema.parse({
        schema_version: "1.0",
        event_id: `lgpd-evento-${n}`,
        type,
        occurred_at: "2026-10-16T10:00:00-03:00",
        source: { channel: "whatsapp", conversation_id: `lgpd-${n}`, message_ids: [] },
        agent: { name: "vito", model: "t", prompt_version: "v" },
        confidence,
        evidence: "Cliente: meu CPF é 123",
        customer: { phone: c.phoneDisplay },
        data,
      });
    await processAgentEvent(
      db,
      event("1", "interaction.logged", { summary: "Pediu preço", channel: "whatsapp" }),
      { threshold: 0.85, today: TODAY },
    );
    await processAgentEvent(db, event("2", "quote.status_changed", { status: "aprovado" }), {
      threshold: 0.85,
      today: TODAY,
    });
    await addService(db, c.id, { type: "reparo", description: "Reparo", date: TODAY }, TODAY);
    await addQuote(db, other.id, { description: "Outro", total: 100 }, TODAY);
    await db
      .insert(telegramChats)
      .values({ chatId: "555001", firstName: "Pessoa", phoneE164: c.phoneE164 });
    await db.insert(telegramMessages).values({ chatId: "555001", author: "cliente", text: "oi" });

    await eraseCustomer(db, c.id);

    expect(await db.select().from(customers).where(eq(customers.id, c.id))).toEqual([]);
    expect(await db.select().from(services).where(eq(services.customerId, c.id))).toEqual([]);
    const events = await db.select().from(agentEvents);
    expect(events.some((e) => JSON.stringify(e.payload).includes(c.phoneDisplay!))).toBe(false);
    expect(await db.select().from(reviewItems)).toEqual([]);
    expect(
      await db.select().from(telegramMessages).where(eq(telegramMessages.chatId, "555001")),
    ).toEqual([]);
    const audits = await db.select().from(auditLog).where(eq(auditLog.entityId, c.id));
    expect(audits.map((a) => [a.action, a.after])).toEqual([
      ["delete", { motivo: "exclusão a pedido do titular (LGPD)" }],
    ]);
    expect(JSON.stringify(await db.select().from(auditLog))).not.toContain(c.phoneDisplay!);
    // Os outros clientes não são tocados.
    expect(await db.select().from(quotes).where(eq(quotes.customerId, other.id))).toHaveLength(1);
  });
});
