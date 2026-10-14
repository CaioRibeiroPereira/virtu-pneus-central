import { eq, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { todayInStore, type DateOnly } from "@/lib/dates";
import type { getDb } from "./index";
import * as s from "./schema";
import { buildSeed } from "./seed-data";

type Db = ReturnType<typeof getDb>;

/**
 * Apaga os dados da demonstração e recria o seed relativo a `today`.
 * Tudo num único batch: o driver HTTP do Neon executa o batch como uma transação,
 * então ou grava tudo ou nada. A tabela herdada (legacy_customers) não é tocada.
 */
export async function resetDemoData(db: Db, today: DateOnly = todayInStore()) {
  const data = buildSeed(today);

  const queries: BatchItem<"pg">[] = [
    db.execute(sql`truncate table audit_log, review_items, tasks, interactions, appointments,
      services, quotes, vehicles, agent_events, customers cascade`),
  ];
  // agent_events ↔ customers se referenciam: insere os eventos sem cliente
  // e liga o cliente no fim, quando os dois lados já existem.
  if (data.agentEvents.length) {
    queries.push(
      db.insert(s.agentEvents).values(data.agentEvents.map((e) => ({ ...e, customerId: null }))),
    );
  }
  const ordered = [
    [s.customers, data.customers],
    [s.vehicles, data.vehicles],
    [s.quotes, data.quotes],
    [s.services, data.services],
    [s.appointments, data.appointments],
    [s.interactions, data.interactions],
    [s.tasks, data.tasks],
    [s.reviewItems, data.reviewItems],
  ] as const;
  for (const [table, rows] of ordered) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- tabelas diferentes no mesmo laço
    if (rows.length) queries.push(db.insert(table).values(rows as any));
  }
  for (const e of data.agentEvents) {
    if (e.customerId && e.id) {
      queries.push(
        db
          .update(s.agentEvents)
          .set({ customerId: e.customerId })
          .where(eq(s.agentEvents.id, e.id)),
      );
    }
  }

  await db.batch(queries as [BatchItem<"pg">, ...BatchItem<"pg">[]]);

  return {
    today,
    customers: data.customers.length,
    vehicles: data.vehicles.length,
    quotes: data.quotes.length,
    services: data.services.length,
    appointments: data.appointments.length,
    interactions: data.interactions.length,
    tasks: data.tasks.length,
    agentEvents: data.agentEvents.length,
    reviewItems: data.reviewItems.length,
  };
}
