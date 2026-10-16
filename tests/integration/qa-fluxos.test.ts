// Fluxos corrigidos depois do teste como usuário (AUDITORIA etapa 15), em Postgres de verdade
// (PGlite): etapa que acompanha os fatos, "Confirmar agendamento" que confirma, cancelamento,
// recusas que não quebram a tela, Vito com data no passado e "Editar e aprovar".
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import type { Db } from "@/db";
import {
  appointments,
  auditLog,
  customers,
  interactions,
  products,
  quotes,
  reviewItems,
  tasks,
} from "@/db/schema";
import {
  addAppointment,
  addInteraction,
  addQuote,
  addService,
  addVehicle,
  CommandError,
  setAppointmentStatus,
  setQuoteStatus,
  setTaskStatus,
  snoozeTask,
} from "@/lib/customers/commands";
import { processAgentEvent } from "@/lib/agent/process";
import { getCustomerDetail } from "@/lib/customers/queries";
import { agentEventSchema } from "@/lib/agent/schema";
import { approveReview } from "@/lib/review/commands";
import { syncAutoTasks } from "@/lib/rules/auto-tasks";
import { createProduct } from "@/lib/oficina/inventory";
import { addDays, storeTimeToUtc } from "@/lib/dates";
import { createTestDb } from "../helpers/db";

const TODAY = "2026-10-16";
let db: Db;
let close: () => Promise<void>;
let seq = 0;

async function newCustomer(fields: Partial<typeof customers.$inferInsert> = {}) {
  seq += 1;
  const n = String(seq).padStart(2, "0");
  const [c] = await db
    .insert(customers)
    .values({
      name: `Cliente ${n}`,
      phoneE164: `+55199000001${n}`,
      phoneDisplay: `(19) 90000-01${n}`,
      ...fields,
    })
    .returning();
  return c;
}
const customer = async (id: string) =>
  (await db.select().from(customers).where(eq(customers.id, id)))[0];
const r4Of = async (appointmentId: string) =>
  (
    await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.appointmentId, appointmentId), eq(tasks.autoRule, "R4")))
  )[0];

/** Evento do Vito já validado pelo contrato (§8). */
const event = (n: string, type: string, phone: string, data: Record<string, unknown>) =>
  agentEventSchema.parse({
    schema_version: "1.0",
    event_id: `qa-fluxos-${n}`,
    type,
    occurred_at: "2026-10-16T10:00:00-03:00",
    source: { channel: "whatsapp", conversation_id: `qa-${n}`, message_ids: [] },
    agent: { name: "vito-extrator", model: "teste", prompt_version: "v" },
    confidence: 0.95,
    customer: { phone },
    data,
  });

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());

describe("etapa do funil acompanha os fatos (D60)", () => {
  it("orçamento → agendamento → serviço: sempre para frente, com auditoria do sistema", async () => {
    const c = await newCustomer();
    await addQuote(db, c.id, { description: "4 pneus", total: 1840 }, TODAY);
    expect((await customer(c.id)).stage).toBe("orcamento_enviado");
    await addAppointment(
      db,
      c.id,
      { date: addDays(TODAY, 2), time: "09:00", serviceType: "troca_pneus" },
      TODAY,
    );
    expect((await customer(c.id)).stage).toBe("agendado");
    await addService(db, c.id, { type: "troca_pneus", description: "Troca", date: TODAY }, TODAY);
    const after = await customer(c.id);
    expect(after.stage).toBe("cliente");
    expect(after.version).toBe(c.version + 3); // quem editava em outra tela recebe o aviso
    // Cliente que pede outro orçamento continua cliente.
    await addQuote(db, c.id, { description: "Alinhamento", total: 90 }, TODAY);
    expect((await customer(c.id)).stage).toBe("cliente");
    const audits = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityId, c.id), eq(auditLog.actorType, "sistema")));
    expect(audits.map((a) => (a.after as { stage: string }).stage)).toEqual([
      "orcamento_enviado",
      "agendado",
      "cliente",
    ]);
  });

  it("perdido volta ao funil ao pedir orçamento; o motivo sai do cadastro (fica na auditoria)", async () => {
    const c = await newCustomer({ stage: "perdido", lossReason: "Achou caro" });
    await addQuote(db, c.id, { description: "2 pneus", total: 760 }, TODAY);
    expect(await customer(c.id)).toMatchObject({ stage: "orcamento_enviado", lossReason: null });
  });

  it("orçamento vindo do Vito também avança a etapa", async () => {
    const c = await newCustomer();
    const out = await processAgentEvent(
      db,
      event("orc", "quote.created", c.phoneDisplay!, { description: "4 pneus", total: 2390 }),
      { threshold: 0.85, today: TODAY },
    );
    expect(out.status).toBe("applied");
    expect((await customer(c.id)).stage).toBe("orcamento_enviado");
  });
});

describe("agendamento e a regra R4", () => {
  it("marcado para hoje: 'Confirmar agendamento' vence hoje, não nasce atrasada", async () => {
    const c = await newCustomer();
    await addAppointment(
      db,
      c.id,
      { date: TODAY, time: "16:00", serviceType: "alinhamento" },
      TODAY,
    );
    const [a] = await db.select().from(appointments).where(eq(appointments.customerId, c.id));
    expect((await r4Of(a.id)).dueDate).toBe(TODAY);
  });

  it("concluir 'Confirmar agendamento' confirma; desfazer volta para 'a confirmar'", async () => {
    const c = await newCustomer();
    await addAppointment(
      db,
      c.id,
      { date: addDays(TODAY, 1), time: "09:00", serviceType: "troca_pneus" },
      TODAY,
    );
    const [a] = await db.select().from(appointments).where(eq(appointments.customerId, c.id));
    const r4 = await r4Of(a.id);
    const done = await setTaskStatus(db, r4.id, "concluida");
    expect(done.note).toMatch(/confirmado/);
    expect((await db.select().from(appointments).where(eq(appointments.id, a.id)))[0].status).toBe(
      "confirmado",
    );
    await setTaskStatus(db, r4.id, "pendente");
    expect((await db.select().from(appointments).where(eq(appointments.id, a.id)))[0].status).toBe(
      "agendado",
    );
    // Concluir de novo numa segunda aba, já concluída: recusa com mensagem (não quebra a tela).
    await setTaskStatus(db, r4.id, "concluida");
    await expect(setTaskStatus(db, r4.id, "concluida")).rejects.toBeInstanceOf(CommandError);
    await expect(snoozeTask(db, r4.id, addDays(TODAY, 1))).rejects.toBeInstanceOf(CommandError);
  });

  it("cancelar o agendamento retira a confirmação pendente; não cancela duas vezes", async () => {
    const c = await newCustomer();
    await addAppointment(
      db,
      c.id,
      { date: addDays(TODAY, 3), time: "14:00", serviceType: "alinhamento" },
      TODAY,
    );
    const [a] = await db.select().from(appointments).where(eq(appointments.customerId, c.id));
    expect((await r4Of(a.id)).status).toBe("pendente");
    await setAppointmentStatus(db, a.id, "cancelado", TODAY);
    expect((await r4Of(a.id)).status).toBe("cancelada");
    await expect(setAppointmentStatus(db, a.id, "cancelado", TODAY)).rejects.toBeInstanceOf(
      CommandError,
    );
  });

  it("R4 pendente de agendamento que já passou é cancelada no dia seguinte", async () => {
    const c = await newCustomer();
    await addAppointment(
      db,
      c.id,
      { date: addDays(TODAY, 1), time: "09:00", serviceType: "rodizio" },
      TODAY,
    );
    const [a] = await db.select().from(appointments).where(eq(appointments.customerId, c.id));
    await syncAutoTasks(db, addDays(TODAY, 2), { customerId: c.id });
    expect((await r4Of(a.id)).status).toBe("cancelada");
  });
});

describe("recusas com mensagem (em vez da página de erro)", () => {
  it("orçamento já decidido não é decidido de novo (duas abas)", async () => {
    const c = await newCustomer();
    await addQuote(db, c.id, { description: "Pneus", total: 500 }, TODAY);
    const [q] = await db.select().from(quotes).where(eq(quotes.customerId, c.id));
    await setQuoteStatus(db, q.id, "recusado", "Achou caro", TODAY);
    await expect(setQuoteStatus(db, q.id, "aprovado", undefined, TODAY)).rejects.toBeInstanceOf(
      CommandError,
    );
    expect((await db.select().from(quotes).where(eq(quotes.id, q.id)))[0]).toMatchObject({
      status: "recusado",
      lossReason: "Achou caro",
    });
  });

  it("atendimento registrado pelo gestor aparece no histórico (sem selo do Vito)", async () => {
    const c = await newCustomer();
    await addInteraction(db, c.id, { channel: "telefone", summary: "Ligou perguntando preço" });
    const detail = await getCustomerDetail(db, c.id, TODAY);
    expect(detail?.timeline[0]).toMatchObject({
      kind: "atendimento",
      title: "Atendimento · Telefone",
      detail: "Ligou perguntando preço",
      viaAgent: false,
    });
  });

  it("produto cadastrado com 'Ativo' desmarcado fica inativo", async () => {
    const id = await createProduct(db, {
      kind: "item",
      name: "Saiu de linha",
      price: 10,
      minQuantity: 0,
      quantity: 0,
      active: false,
    });
    expect((await db.select().from(products).where(eq(products.id, id)))[0].active).toBe(false);
  });

  it("veículo novo: placa normalizada; a mesma placa não entra duas vezes", async () => {
    const c = await newCustomer();
    await addVehicle(db, c.id, { vehicleModel: "Onix", vehiclePlate: "abc-1d23" });
    await expect(
      addVehicle(db, c.id, { vehicleModel: "Onix", vehiclePlate: "ABC1D23" }),
    ).rejects.toMatchObject({ field: "vehiclePlate" });
  });
});

describe("Vito com data no passado", () => {
  it("agendamento para um dia que já passou vai para a Revisão (data_passada)", async () => {
    const c = await newCustomer();
    const out = await processAgentEvent(
      db,
      event("ag-passado", "appointment.requested", c.phoneDisplay!, {
        scheduled_at: "2026-09-01T09:00:00-03:00",
        service_type: "alinhamento",
      }),
      { threshold: 0.85, today: TODAY },
    );
    expect(out).toMatchObject({ status: "queued_for_review", reason: "data_passada" });
    const reviewId = (out as { reviewId: string }).reviewId;
    // Aprovar sem corrigir: recusado com explicação.
    expect(await approveReview(db, reviewId, {}, TODAY)).toMatchObject({
      ok: false,
      reason: "invalid_edit",
    });
    // Corrigindo o dia em "Editar e aprovar": entra.
    const fixed = await approveReview(
      db,
      reviewId,
      { editedData: { scheduled_at: storeTimeToUtc(addDays(TODAY, 1), "09:00").toISOString() } },
      TODAY,
    );
    expect(fixed.ok).toBe(true);
    expect((await customer(c.id)).stage).toBe("agendado");
  });

  it("próxima ação sugerida com prazo no passado vira hoje", async () => {
    const c = await newCustomer();
    await processAgentEvent(
      db,
      event("tk-passado", "task.suggested", c.phoneDisplay!, {
        type: "outro",
        title: "Ligar de volta",
        reason: "Pediu retorno",
        due_date: "2026-09-01",
      }),
      { threshold: 0.85, today: TODAY },
    );
    const [t] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.customerId, c.id), eq(tasks.title, "Ligar de volta")));
    expect(t.dueDate).toBe(TODAY);
  });

  it("aprovação de orçamento sem orçamento em aberto: aviso, e nada fica gravado pela metade", async () => {
    const out = await processAgentEvent(
      db,
      event("aprova-sem-orc", "quote.status_changed", "(19) 97777-0001", { status: "aprovado" }),
      { threshold: 0.85, today: TODAY },
    );
    expect(out.status).toBe("queued_for_review");
    const reviewId = (out as { reviewId: string }).reviewId;
    const before = (await db.select().from(customers)).length;
    const result = await approveReview(db, reviewId, { createCustomerName: "Pessoa Nova" }, TODAY);
    expect(result).toMatchObject({ ok: false, reason: "quote_not_found" });
    // O cliente novo criado no meio da aprovação foi desfeito junto (transação).
    expect((await db.select().from(customers)).length).toBe(before);
    const [review] = await db.select().from(reviewItems).where(eq(reviewItems.id, reviewId));
    expect(review.status).toBe("pendente");
  });
});

describe("atendimento que veio do Telegram", () => {
  it("é gravado com o canal Telegram, mesmo que o extrator diga WhatsApp", async () => {
    const c = await newCustomer();
    const ev = agentEventSchema.parse({
      ...event("tg-canal", "interaction.logged", c.phoneDisplay!, {
        summary: "Perguntou o horário",
        channel: "whatsapp",
      }),
      source: { channel: "whatsapp", conversation_id: "tg-777-abcd1234", message_ids: [] },
    });
    await processAgentEvent(db, ev, { threshold: 0.85, today: TODAY });
    const [i] = await db.select().from(interactions).where(eq(interactions.customerId, c.id));
    expect(i.channel).toBe("telegram");
  });
});
