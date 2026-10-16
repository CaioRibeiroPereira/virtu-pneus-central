// Dados extras da tela Hoje no estilo D55: progresso do dia, orçamentos parados (com o total em R$)
// e um resumo das sugestões do Vito. Separado de loadTodayPanel, que o resumo diário também usa.
import { and, asc, count, eq, gte, lt, lte, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { agentEvents, customers, quotes, reviewItems, tasks } from "@/db/schema";
import { addDays, storeTimeToUtc, type DateOnly } from "@/lib/dates";
import { agentEventLabel } from "@/lib/labels";

export type TodayExtras = {
  /** Ações concluídas hoje (dia da loja). */
  doneToday: number;
  /** Orçamentos com acompanhamento (R1) vencido ou de hoje. */
  staleQuotes: { count: number; total: number };
  /** Até 3 sugestões pendentes, mais antigas primeiro: "Ricardo Alves — decisão sobre orçamento". */
  reviewSummaries: string[];
};

export async function loadTodayExtras(db: Db, today: DateOnly): Promise<TodayExtras> {
  const dayStart = storeTimeToUtc(today, "00:00");
  const nextDayStart = storeTimeToUtc(addDays(today, 1), "00:00");

  const [[done], [stale], reviews] = await Promise.all([
    db
      .select({ value: count() })
      .from(tasks)
      .where(
        and(
          eq(tasks.status, "concluida"),
          gte(tasks.completedAt, dayStart),
          lt(tasks.completedAt, nextDayStart),
        ),
      ),
    db
      .select({ value: count(), total: sql<string | null>`sum(${quotes.total})` })
      .from(tasks)
      .innerJoin(quotes, eq(quotes.id, tasks.quoteId))
      .where(
        and(
          eq(tasks.status, "pendente"),
          eq(tasks.type, "followup_orcamento"),
          lte(tasks.dueDate, today),
        ),
      ),
    db
      .select({ type: agentEvents.type, name: customers.name })
      .from(reviewItems)
      .innerJoin(agentEvents, eq(agentEvents.id, reviewItems.agentEventId))
      .leftJoin(customers, eq(customers.id, agentEvents.customerId))
      .where(eq(reviewItems.status, "pendente"))
      .orderBy(asc(reviewItems.createdAt))
      .limit(3),
  ]);

  return {
    doneToday: done.value,
    staleQuotes: { count: stale.value, total: Number(stale.total ?? 0) },
    reviewSummaries: reviews.map(
      (r) => `${r.name ?? "Número novo"} — ${agentEventLabel[r.type] ?? "sugestão"}`,
    ),
  };
}
