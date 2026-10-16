import { eq, sql } from "drizzle-orm";
import { todayInStore, type DateOnly } from "@/lib/dates";
import { syncAutoTasks } from "@/lib/rules/auto-tasks";
import type { Db } from "./index";
import * as s from "./schema";
import { buildSeed } from "./seed-data";

/**
 * Apaga os dados da demonstração e recria o seed relativo a `today`, numa única transação
 * (ou grava tudo, ou nada). Depois gera as tarefas automáticas R1–R4 (D25).
 * A tabela herdada (legacy_customers) não é tocada. Precisa de um banco com transação.
 */
export async function resetDemoData(db: Db, today: DateOnly = todayInStore()) {
  const data = buildSeed(today);

  await db.transaction(async (tx) => {
    await tx.execute(sql`truncate table audit_log, review_items, tasks, interactions, appointments,
      services, quotes, vehicles, agent_events, customers cascade`);
    // Conversas do Telegram são do canal real, não da demo: ficam. Só perdem o atalho para os
    // clientes apagados; na próxima mensagem voltam a ser ligadas pelo telefone (D57).
    await tx.update(s.telegramChats).set({ customerId: null });
    // agent_events ↔ customers se referenciam: insere os eventos sem cliente
    // e liga o cliente no fim, quando os dois lados já existem.
    if (data.agentEvents.length) {
      await tx
        .insert(s.agentEvents)
        .values(data.agentEvents.map((e) => ({ ...e, customerId: null })));
    }
    if (data.customers.length) await tx.insert(s.customers).values(data.customers);
    if (data.vehicles.length) await tx.insert(s.vehicles).values(data.vehicles);
    if (data.quotes.length) await tx.insert(s.quotes).values(data.quotes);
    if (data.services.length) await tx.insert(s.services).values(data.services);
    if (data.appointments.length) await tx.insert(s.appointments).values(data.appointments);
    if (data.interactions.length) await tx.insert(s.interactions).values(data.interactions);
    if (data.tasks.length) await tx.insert(s.tasks).values(data.tasks);
    if (data.reviewItems.length) await tx.insert(s.reviewItems).values(data.reviewItems);
    for (const e of data.agentEvents) {
      if (e.customerId && e.id) {
        await tx
          .update(s.agentEvents)
          .set({ customerId: e.customerId })
          .where(eq(s.agentEvents.id, e.id));
      }
    }
  });

  const autoTasks = await syncAutoTasks(db, today);

  return {
    today,
    customers: data.customers.length,
    vehicles: data.vehicles.length,
    quotes: data.quotes.length,
    services: data.services.length,
    appointments: data.appointments.length,
    interactions: data.interactions.length,
    manualTasks: data.tasks.length,
    autoTasksCreated: autoTasks.created,
    agentEvents: data.agentEvents.length,
    reviewItems: data.reviewItems.length,
  };
}
