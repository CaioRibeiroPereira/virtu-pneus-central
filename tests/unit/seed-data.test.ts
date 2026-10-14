import { describe, expect, it } from "vitest";
import { addDays, storeDateOf } from "@/lib/dates";
import { normalizePhone } from "@/lib/phone";
import { buildSeed } from "@/db/seed-data";

const TODAY = "2026-10-14";
const seed = buildSeed(TODAY);
const daysAgo = (instant: Date | null | undefined) =>
  instant ? -Math.round((Date.parse(TODAY) - Date.parse(storeDateOf(instant))) / 86_400_000) : NaN;

describe("buildSeed — dados coerentes", () => {
  it("tem cerca de 15 clientes com telefones válidos e únicos", () => {
    expect(seed.customers.length).toBeGreaterThanOrEqual(14);
    const phones = seed.customers.map((c) => c.phoneE164);
    expect(new Set(phones).size).toBe(phones.length);
    for (const c of seed.customers) {
      expect(normalizePhone(c.phoneE164!)?.e164).toBe(c.phoneE164);
    }
  });

  it("todas as referências entre tabelas apontam para registros existentes", () => {
    const ids = (rows: { id?: string }[]) => new Set(rows.map((r) => r.id));
    const customers = ids(seed.customers);
    const vehicles = ids(seed.vehicles);
    const quotes = ids(seed.quotes);
    const services = ids(seed.services);
    const events = ids(seed.agentEvents);
    for (const r of [
      ...seed.vehicles,
      ...seed.quotes,
      ...seed.services,
      ...seed.appointments,
      ...seed.interactions,
      ...seed.tasks,
    ]) {
      expect(customers.has(r.customerId)).toBe(true);
    }
    for (const r of [...seed.quotes, ...seed.services, ...seed.appointments]) {
      if (r.vehicleId) expect(vehicles.has(r.vehicleId)).toBe(true);
    }
    for (const t of seed.tasks) {
      if (t.quoteId) expect(quotes.has(t.quoteId)).toBe(true);
      if (t.serviceId) expect(services.has(t.serviceId)).toBe(true);
    }
    for (const r of [...seed.customers, ...seed.quotes, ...seed.tasks, ...seed.interactions]) {
      if (r.agentEventId) expect(events.has(r.agentEventId)).toBe(true);
    }
    for (const r of seed.reviewItems) expect(events.has(r.agentEventId)).toBe(true);
  });

  it("cliente perdido sempre tem motivo (regra do banco)", () => {
    for (const c of seed.customers.filter((c) => c.stage === "perdido")) {
      expect(c.lossReason?.trim()).toBeTruthy();
    }
  });

  it("event_id dos eventos é único (idempotência)", () => {
    const ids = seed.agentEvents.map((e) => e.eventId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("buildSeed — cobertura das regras e do painel Hoje", () => {
  it("R1: orçamentos enviados há 5, 3 e 1 dia", () => {
    const sent = seed.quotes.filter((q) => q.status === "enviado").map((q) => daysAgo(q.sentAt));
    expect(sent).toEqual(expect.arrayContaining([-5, -3, -1]));
  });

  it("R2: serviços há 9, 7 e 3 dias sem pós-venda feito", () => {
    const withPostSale = new Set(
      seed.tasks.filter((t) => t.autoRule === "R2").map((t) => t.serviceId),
    );
    const recent = seed.services
      .filter((s) => !withPostSale.has(s.id))
      .map((s) => daysAgo(s.performedAt));
    expect(recent).toEqual(expect.arrayContaining([-9, -7, -3]));
  });

  it("R3: trocas de pneus há 185 e 180 dias, com pós-venda antigo já concluído", () => {
    const old = seed.services.filter(
      (s) => s.type === "troca_pneus" && daysAgo(s.performedAt) <= -180,
    );
    expect(old.map((s) => daysAgo(s.performedAt)).sort((a, b) => a - b)).toEqual([-185, -180]);
    for (const s of old) {
      expect(
        seed.tasks.some(
          (t) => t.serviceId === s.id && t.autoRule === "R2" && t.status === "concluida",
        ),
      ).toBe(true);
    }
  });

  it("R4: agendamento 'agendado' para amanhã; também há um confirmado para hoje", () => {
    const tomorrow = addDays(TODAY, 1);
    expect(
      seed.appointments.some(
        (a) => a.status === "agendado" && storeDateOf(a.scheduledAt) === tomorrow,
      ),
    ).toBe(true);
    expect(
      seed.appointments.some(
        (a) => a.status === "confirmado" && storeDateOf(a.scheduledAt) === TODAY,
      ),
    ).toBe(true);
  });

  it("tarefas manuais atrasada, para hoje e para os próximos dias", () => {
    const due = seed.tasks
      .filter((t) => t.status !== "concluida" && !t.autoRule)
      .map((t) => t.dueDate);
    expect(due).toEqual(expect.arrayContaining([addDays(TODAY, -1), TODAY, addDays(TODAY, 5)]));
  });

  it("cliente provisório criado pelo agente", () => {
    const provisional = seed.customers.find((c) => c.isProvisional);
    expect(provisional?.source).toBe("agente");
    expect(provisional?.agentEventId).toBeTruthy();
  });

  it("fila de revisão com alto impacto, baixa confiança e conflito com edição humana", () => {
    expect(seed.reviewItems.map((r) => r.reason).sort()).toEqual([
      "alto_impacto",
      "baixa_confianca",
      "conflito_edicao_humana",
    ]);
  });
});
