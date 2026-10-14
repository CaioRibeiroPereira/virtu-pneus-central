// Regras automáticas (R1–R4) e painel "Hoje" sobre o seed completo, em Postgres de verdade (PGlite).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, count, eq, isNotNull } from "drizzle-orm";
import type { Db } from "@/db";
import { appointments, auditLog, customers, quotes, tasks } from "@/db/schema";
import { resetDemoData } from "@/db/reset";
import { addDays } from "@/lib/dates";
import { syncAutoTasks } from "@/lib/rules/auto-tasks";
import { loadTodayPanel, type TodayPanel } from "@/lib/rules/today";
import { createTestDb } from "../helpers/db";

const TODAY = "2026-10-14";
let db: Db;
let close: () => Promise<void>;
let panel: TodayPanel;

const autoTaskCount = async () =>
  (await db.select({ n: count() }).from(tasks).where(isNotNull(tasks.autoRule)))[0].n;
const names = (items: { customerName: string }[]) => items.map((i) => i.customerName);

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  const summary = await resetDemoData(db, TODAY);
  expect(summary.autoTasksCreated).toBeGreaterThan(0);
  panel = await loadTodayPanel(db, TODAY);
});
afterAll(() => close());

describe("painel Hoje sobre o seed", () => {
  it("mostra a faixa de revisão com os 3 itens pendentes", () => {
    expect(panel.pendingReviews).toBe(3);
  });

  it("atrasados: R1 (orçamento há 5 dias), R2 (serviço há 9 dias), R3 (troca há 185 dias) e tarefa manual", () => {
    expect(names(panel.overdue)).toEqual(
      expect.arrayContaining(["Ricardo Alves", "Patrícia Gomes", "Beatriz Rocha", "Lucas Ribeiro"]),
    );
    // Mais antigo primeiro.
    const dues = panel.overdue.map((t) => t.dueDate);
    expect([...dues].sort()).toEqual(dues);
    const ricardo = panel.overdue.find((t) => t.customerName === "Ricardo Alves")!;
    expect(ricardo).toMatchObject({ type: "followup_orcamento", daysOverdue: 2 });
  });

  it("para hoje: agendamento do dia primeiro, depois R1, R2, R3, R4 e a tarefa manual", () => {
    expect(panel.dueToday[0]).toMatchObject({
      kind: "appointment",
      customerName: "Daniel Souza",
      time: "11:30",
    });
    expect(names(panel.dueToday)).toEqual(
      expect.arrayContaining([
        "Fernanda Costa", // R1: enviado há 3 dias
        "Juliana Santos", // R2: serviço há 7 dias
        "Carlos Pereira", // R3: troca há 180 dias
        "Roberto Nunes", // R4: agendamento amanhã
        "Marcos Oliveira", // tarefa manual
      ]),
    );
  });

  it("próximos 7 dias: R1 (enviado ontem), R2 (há 3 dias), R4 (em 3 dias) e tarefa manual", () => {
    expect(names(panel.upcoming)).toEqual(
      expect.arrayContaining([
        "Marcos Oliveira",
        "Paulo Teixeira",
        "Camila Ferreira",
        "Ana Barbosa",
      ]),
    );
    expect(panel.upcoming.every((t) => t.dueDate > TODAY && t.dueDate <= addDays(TODAY, 7))).toBe(
      true,
    );
  });

  it("não recria pós-venda de serviço antigo já concluído", async () => {
    const [carlos] = await db.select().from(customers).where(eq(customers.name, "Carlos Pereira"));
    const r2 = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.customerId, carlos.id), eq(tasks.autoRule, "R2")));
    expect(r2).toHaveLength(1);
    expect(r2[0].status).toBe("concluida");
  });

  it("é idempotente: sincronizar de novo não cria nada", async () => {
    const before = await autoTaskCount();
    expect(await syncAutoTasks(db, TODAY)).toEqual({ created: 0, cancelled: 0 });
    expect(await autoTaskCount()).toBe(before);
  });
});

describe("cancelamento quando a condição deixa de valer", () => {
  it("orçamento aprovado cancela o follow-up R1 pendente, com auditoria", async () => {
    const [fernanda] = await db
      .select()
      .from(customers)
      .where(eq(customers.name, "Fernanda Costa"));
    const [quote] = await db.select().from(quotes).where(eq(quotes.customerId, fernanda.id));
    await db.update(quotes).set({ status: "aprovado" }).where(eq(quotes.id, quote.id));

    expect((await syncAutoTasks(db, TODAY)).cancelled).toBe(1);
    const [r1] = await db.select().from(tasks).where(eq(tasks.quoteId, quote.id));
    expect(r1.status).toBe("cancelada");
    const audits = await db.select().from(auditLog).where(eq(auditLog.entityId, r1.id));
    expect(audits.some((a) => a.action === "update" && a.actorType === "sistema")).toBe(true);
  });

  it("agendamento confirmado cancela o R4 'confirmar agendamento'", async () => {
    const [roberto] = await db.select().from(customers).where(eq(customers.name, "Roberto Nunes"));
    await db
      .update(appointments)
      .set({ status: "confirmado" })
      .where(eq(appointments.customerId, roberto.id));
    await syncAutoTasks(db, TODAY);
    const [r4] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.customerId, roberto.id), eq(tasks.autoRule, "R4")));
    expect(r4.status).toBe("cancelada");
  });
});
