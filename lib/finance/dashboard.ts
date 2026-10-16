// Painel financeiro e funil de vendas (D61). `buildDashboard` é puro (recebe as linhas e devolve os
// números, testável sem banco); `loadDashboard` lê o banco. Datas sempre no dia da loja (D11).
import { eq, gte, or } from "drizzle-orm";
import type { Db } from "@/db";
import { customers, products, quotes, services } from "@/db/schema";
import { addDays, storeDateOf, storeTimeToUtc, type DateOnly } from "@/lib/dates";

export const PERIODS = [
  ["mes", "Este mês"],
  ["mes-passado", "Mês passado"],
  ["30d", "Últimos 30 dias"],
  ["ano", "Este ano"],
] as const;
export type Period = (typeof PERIODS)[number][0];

/** Intervalo [início, fim) em dias da loja e o intervalo anterior, do mesmo tamanho. */
export type Range = { start: DateOnly; end: DateOnly; prevStart: DateOnly; prevEnd: DateOnly };

const monthStart = (d: DateOnly) => `${d.slice(0, 7)}-01`;
/** Mesmo dia `n` meses antes (ou depois), limitado ao fim do mês: 31/03 − 1 mês = 28/02. */
function shiftMonths(d: DateOnly, n: number): DateOnly {
  const [y, m, day] = d.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(day, last));
  return first.toISOString().slice(0, 10);
}

export function periodRange(period: Period, today: DateOnly): Range {
  const tomorrow = addDays(today, 1);
  switch (period) {
    case "mes-passado": {
      const start = shiftMonths(monthStart(today), -1);
      return { start, end: monthStart(today), prevStart: shiftMonths(start, -1), prevEnd: start };
    }
    case "30d": {
      const start = addDays(today, -29);
      return { start, end: tomorrow, prevStart: addDays(start, -30), prevEnd: start };
    }
    case "ano": {
      const start = `${today.slice(0, 4)}-01-01`;
      const prevStart = `${Number(today.slice(0, 4)) - 1}-01-01`;
      return { start, end: tomorrow, prevStart, prevEnd: shiftMonths(tomorrow, -12) };
    }
    default: {
      // Mês até hoje, comparado com os mesmos dias do mês anterior (comparar com o mês
      // anterior inteiro faria todo começo de mês parecer queda).
      const start = monthStart(today);
      const prevStart = shiftMonths(start, -1);
      return { start, end: tomorrow, prevStart, prevEnd: shiftMonths(tomorrow, -1) };
    }
  }
}

export type DashboardInput = {
  today: DateOnly;
  period: Period;
  services: { performedAt: Date; total: number | null; type: string }[];
  quotes: {
    status: string;
    total: number;
    sentAt: Date | null;
    respondedAt: Date | null;
    lossReason: string | null;
    customerStage: string;
  }[];
  customers: { stage: string }[];
  products: { quantity: number; price: number; active: boolean }[];
};

/** Etapas do funil, na ordem (D60). "Perdido" fica fora da sequência. */
export const FUNNEL_STAGES = [
  "novo_contato",
  "em_negociacao",
  "orcamento_enviado",
  "agendado",
  "cliente",
] as const;

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** Variação percentual (null quando não há base para comparar). */
const change = (now: number, before: number) =>
  before > 0 ? Math.round(((now - before) / before) * 100) : null;
const sum = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;

export function buildDashboard(input: DashboardInput) {
  const range = periodRange(input.period, input.today);
  const inRange = (at: Date | null, start: DateOnly, end: DateOnly) => {
    if (!at) return false;
    const day = storeDateOf(at);
    return day >= start && day < end;
  };
  const cur = (at: Date | null) => inRange(at, range.start, range.end);
  const prev = (at: Date | null) => inRange(at, range.prevStart, range.prevEnd);

  // Faturamento = serviços feitos no período (o que entrou no caixa, pelo registro da oficina).
  const servicesNow = input.services.filter((s) => cur(s.performedAt));
  const servicesBefore = input.services.filter((s) => prev(s.performedAt));
  const revenue = sum(servicesNow.map((s) => s.total ?? 0));
  const revenueBefore = sum(servicesBefore.map((s) => s.total ?? 0));
  const priced = servicesNow.filter((s) => s.total != null);

  const sent = input.quotes.filter((q) => cur(q.sentAt));
  const decided = input.quotes.filter(
    (q) => (q.status === "aprovado" || q.status === "recusado") && cur(q.respondedAt),
  );
  const approved = decided.filter((q) => q.status === "aprovado");
  const refused = decided.filter((q) => q.status === "recusado");
  const open = input.quotes.filter((q) => q.status === "enviado");

  // Funil acumulado: quem chegou a cada etapa (está nela ou além). Mostra onde as vendas param.
  const active = input.customers.filter((c) => c.stage !== "perdido");
  const rank = (stage: string) => FUNNEL_STAGES.indexOf(stage as (typeof FUNNEL_STAGES)[number]);
  const funnel = FUNNEL_STAGES.map((stage, i) => {
    const reached = active.filter((c) => rank(c.stage) >= i).length;
    return {
      stage,
      reached,
      here: active.filter((c) => c.stage === stage).length,
      openValue: sum(open.filter((q) => q.customerStage === stage).map((q) => q.total)),
    };
  }).map((step, i, all) => ({
    ...step,
    // Conversão da etapa anterior para esta.
    conversion:
      i === 0 || !all[i - 1].reached ? null : Math.round((step.reached / all[i - 1].reached) * 100),
  }));

  // Últimos 6 meses (o atual incluído, até hoje).
  const months = Array.from({ length: 6 }, (_, i) => shiftMonths(monthStart(input.today), i - 5));
  const byMonth = months.map((m) => ({
    month: m.slice(0, 7),
    label: MONTHS[Number(m.slice(5, 7)) - 1],
    total: sum(
      input.services
        .filter((s) => storeDateOf(s.performedAt).slice(0, 7) === m.slice(0, 7))
        .map((s) => s.total ?? 0),
    ),
  }));

  const byType = Object.entries(
    servicesNow.reduce<Record<string, number>>((acc, s) => {
      acc[s.type] = (acc[s.type] ?? 0) + (s.total ?? 0);
      return acc;
    }, {}),
  )
    .map(([type, total]) => ({ type, total: sum([total]) }))
    .sort((a, b) => b.total - a.total);

  const lossReasons = Object.entries(
    refused.reduce<Record<string, { count: number; total: number }>>((acc, q) => {
      const reason = q.lossReason?.trim() || "Sem motivo informado";
      acc[reason] ??= { count: 0, total: 0 };
      acc[reason].count += 1;
      acc[reason].total += q.total;
      return acc;
    }, {}),
  )
    .map(([reason, v]) => ({ reason, count: v.count, total: sum([v.total]) }))
    .sort((a, b) => b.total - a.total);

  return {
    range,
    revenue: { total: revenue, change: change(revenue, revenueBefore), previous: revenueBefore },
    services: {
      count: servicesNow.length,
      change: change(servicesNow.length, servicesBefore.length),
      averageTicket: priced.length ? sum([revenue / priced.length]) : null,
    },
    quotesSent: { count: sent.length, total: sum(sent.map((q) => q.total)) },
    approval: {
      approved: approved.length,
      decided: decided.length,
      rate: decided.length ? Math.round((approved.length / decided.length) * 100) : null,
      approvedTotal: sum(approved.map((q) => q.total)),
    },
    lost: { count: refused.length, total: sum(refused.map((q) => q.total)) },
    open: { count: open.length, total: sum(open.map((q) => q.total)) },
    stockValue: sum(input.products.filter((p) => p.active).map((p) => p.quantity * p.price)),
    funnel,
    lostCustomers: input.customers.filter((c) => c.stage === "perdido").length,
    byMonth,
    byType,
    lossReasons,
  };
}

export type Dashboard = ReturnType<typeof buildDashboard>;

/** Lê só o necessário: serviços e orçamentos desde o começo do que será comparado. */
export async function loadDashboard(db: Db, period: Period, today: DateOnly): Promise<Dashboard> {
  const range = periodRange(period, today);
  const sixMonths = shiftMonths(monthStart(today), -5);
  const since = storeTimeToUtc(range.prevStart < sixMonths ? range.prevStart : sixMonths, "00:00");
  const [serviceRows, quoteRows, customerRows, productRows] = await Promise.all([
    db
      .select({ performedAt: services.performedAt, total: services.total, type: services.type })
      .from(services)
      .where(gte(services.performedAt, since)),
    db
      .select({
        status: quotes.status,
        total: quotes.total,
        sentAt: quotes.sentAt,
        respondedAt: quotes.respondedAt,
        lossReason: quotes.lossReason,
        customerStage: customers.stage,
      })
      .from(quotes)
      .innerJoin(customers, eq(customers.id, quotes.customerId))
      .where(
        or(eq(quotes.status, "enviado"), gte(quotes.sentAt, since), gte(quotes.respondedAt, since)),
      ),
    db.select({ stage: customers.stage }).from(customers),
    db
      .select({ quantity: products.quantity, price: products.price, active: products.active })
      .from(products),
  ]);
  return buildDashboard({
    today,
    period,
    services: serviceRows,
    quotes: quoteRows,
    customers: customerRows,
    products: productRows,
  });
}
