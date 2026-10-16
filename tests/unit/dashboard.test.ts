import { describe, expect, it } from "vitest";
import { buildDashboard, periodRange, type DashboardInput } from "@/lib/finance/dashboard";
import { buildSeed } from "@/db/seed-data";
import { storeTimeToUtc } from "@/lib/dates";

const TODAY = "2026-10-16";
const at = (day: string, time = "15:00") => storeTimeToUtc(day, time);

describe("períodos do painel (dia da loja)", () => {
  it("este mês: até hoje, comparado com os mesmos dias do mês anterior", () => {
    expect(periodRange("mes", TODAY)).toEqual({
      start: "2026-10-01",
      end: "2026-10-17",
      prevStart: "2026-09-01",
      prevEnd: "2026-09-17",
    });
  });
  it("mês passado, 30 dias e ano", () => {
    expect(periodRange("mes-passado", TODAY)).toMatchObject({
      start: "2026-09-01",
      end: "2026-10-01",
      prevStart: "2026-08-01",
    });
    expect(periodRange("30d", TODAY)).toMatchObject({
      start: "2026-09-17",
      end: "2026-10-17",
      prevStart: "2026-08-18",
    });
    expect(periodRange("ano", TODAY)).toEqual({
      start: "2026-01-01",
      end: "2026-10-17",
      prevStart: "2025-01-01",
      prevEnd: "2025-10-17",
    });
  });
  it("fim de mês não escorrega para o mês seguinte (30/03 − 1 mês = 28/02)", () => {
    expect(periodRange("mes", "2026-03-30").prevEnd).toBe("2026-02-28");
  });
});

describe("números do painel", () => {
  const input: DashboardInput = {
    today: TODAY,
    period: "mes",
    services: [
      { performedAt: at("2026-10-02"), total: 1000, type: "troca_pneus" },
      { performedAt: at("2026-10-10"), total: 200, type: "alinhamento" },
      { performedAt: at("2026-10-12"), total: null, type: "reparo" },
      // 23h30 do dia 30/09 em Brasília já é 01/10 em UTC: conta em setembro.
      { performedAt: at("2026-09-30", "23:30"), total: 600, type: "troca_pneus" },
      { performedAt: at("2026-09-05"), total: 400, type: "rodizio" },
    ],
    quotes: [
      {
        status: "aprovado",
        total: 1000,
        sentAt: at("2026-10-01"),
        respondedAt: at("2026-10-02"),
        lossReason: null,
        customerStage: "cliente",
      },
      {
        status: "recusado",
        total: 500,
        sentAt: at("2026-10-03"),
        respondedAt: at("2026-10-05"),
        lossReason: "Achou caro",
        customerStage: "perdido",
      },
      {
        status: "recusado",
        total: 300,
        sentAt: at("2026-10-04"),
        respondedAt: at("2026-10-06"),
        lossReason: null,
        customerStage: "em_negociacao",
      },
      {
        status: "enviado",
        total: 2390,
        sentAt: at("2026-10-11"),
        respondedAt: null,
        lossReason: null,
        customerStage: "orcamento_enviado",
      },
      {
        status: "enviado",
        total: 800,
        sentAt: at("2026-08-11"),
        respondedAt: null,
        lossReason: null,
        customerStage: "agendado",
      },
    ],
    customers: [
      { stage: "novo_contato" },
      { stage: "novo_contato" },
      { stage: "em_negociacao" },
      { stage: "orcamento_enviado" },
      { stage: "agendado" },
      { stage: "cliente" },
      { stage: "cliente" },
      { stage: "perdido" },
    ],
    products: [
      { quantity: 4, price: 460, active: true },
      { quantity: 10, price: 8, active: true },
      { quantity: 3, price: 999, active: false },
    ],
  };
  const d = buildDashboard(input);

  it("faturamento = serviços feitos no período, com a variação", () => {
    // Comparação com 01–16/09: só o serviço de 05/09 (o de 30/09 fica fora).
    expect(d.revenue).toEqual({ total: 1200, previous: 400, change: 200 });
    expect(d.services).toEqual({ count: 3, change: 200, averageTicket: 600 }); // sem valor fica fora do ticket
  });

  it("orçamentos: enviados, aprovação sobre os decididos, recusas e o que está em aberto", () => {
    expect(d.quotesSent).toEqual({ count: 4, total: 4190 });
    expect(d.approval).toEqual({ approved: 1, decided: 3, rate: 33, approvedTotal: 1000 });
    expect(d.lost).toEqual({ count: 2, total: 800 });
    expect(d.open).toEqual({ count: 2, total: 3190 }); // em aberto não depende do período
    expect(d.lossReasons).toEqual([
      { reason: "Achou caro", count: 1, total: 500 },
      { reason: "Sem motivo informado", count: 1, total: 300 },
    ]);
  });

  it("funil acumulado: quem chegou a cada etapa, com a conversão e o valor parado", () => {
    expect(d.funnel.map((f) => [f.stage, f.reached, f.here, f.conversion])).toEqual([
      ["novo_contato", 7, 2, null],
      ["em_negociacao", 5, 1, 71],
      ["orcamento_enviado", 4, 1, 80],
      ["agendado", 3, 1, 75],
      ["cliente", 2, 2, 67],
    ]);
    expect(d.funnel.find((f) => f.stage === "orcamento_enviado")?.openValue).toBe(2390);
    expect(d.lostCustomers).toBe(1);
  });

  it("últimos 6 meses, por tipo de serviço e estoque ativo", () => {
    expect(d.byMonth.map((m) => [m.label, m.total])).toEqual([
      ["mai", 0],
      ["jun", 0],
      ["jul", 0],
      ["ago", 0],
      ["set", 1000],
      ["out", 1200],
    ]);
    expect(d.byType).toEqual([
      { type: "troca_pneus", total: 1000 },
      { type: "alinhamento", total: 200 },
      { type: "reparo", total: 0 },
    ]);
    expect(d.stockValue).toBe(1920);
  });
});

describe("a demonstração tem o que mostrar no painel", () => {
  it("vendas em vários meses, recusas com motivo e funil que afunila", () => {
    const seed = buildSeed(TODAY);
    const d = buildDashboard({
      today: TODAY,
      period: "30d",
      services: seed.services.map((s) => ({
        performedAt: s.performedAt as Date,
        total: s.total ?? null,
        type: s.type as string,
      })),
      quotes: seed.quotes.map((q) => ({
        status: q.status as string,
        total: q.total,
        sentAt: q.sentAt ?? null,
        respondedAt: q.respondedAt ?? null,
        lossReason: q.lossReason ?? null,
        customerStage: seed.customers.find((c) => c.id === q.customerId)?.stage ?? "novo_contato",
      })),
      customers: seed.customers.map((c) => ({ stage: c.stage ?? "novo_contato" })),
      products: seed.products.map((p) => ({ quantity: p.quantity!, price: p.price, active: true })),
    });
    expect(d.byMonth.filter((m) => m.total > 0).length).toBeGreaterThanOrEqual(5);
    expect(d.revenue.total).toBeGreaterThan(0);
    expect(d.lossReasons.length).toBeGreaterThanOrEqual(2);
    const reached = d.funnel.map((f) => f.reached);
    expect([...reached].sort((a, b) => b - a)).toEqual(reached);
    expect(reached[0]).toBeGreaterThan(reached.at(-1)!);
  });
});
