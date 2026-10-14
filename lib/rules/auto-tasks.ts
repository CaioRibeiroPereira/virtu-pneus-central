// Regras automáticas de tarefas (§7.1). Duas partes:
//  - computeAutoTasks: cálculo puro (sem banco) do que DEVERIA existir — fácil de testar;
//  - syncAutoTasks: compara com o banco, cria o que falta e cancela o que deixou de valer.
// Idempotente: rodar duas vezes não duplica nada (índice único tasks_auto_rule_unique, D22).
// Não depende de cron: roda ao abrir o painel Hoje e após cada evento aplicado.
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { Db } from "@/db";
import { appointments, auditLog, quotes, services, tasks } from "@/db/schema";
import { addDays, formatDate, formatTime, storeDateOf, type DateOnly } from "@/lib/dates";
import { formatMoney, serviceTypeLabel } from "@/lib/labels";
import { COMMERCIAL_RETURN_DAYS, POST_SALE_DAYS, QUOTE_FOLLOWUP_DAYS } from "./config";

export type QuoteFact = {
  id: string;
  customerId: string;
  status: string;
  sentAt: Date | null;
  total: number;
};
export type ServiceFact = {
  id: string;
  customerId: string;
  type: string;
  description: string;
  performedAt: Date;
};
export type AppointmentFact = {
  id: string;
  customerId: string;
  status: string;
  scheduledAt: Date;
  serviceType: string;
};
export type PendingAutoTask = {
  id: string;
  autoRule: string;
  quoteId: string | null;
  appointmentId: string | null;
};

export type DesiredTask = {
  customerId: string;
  autoRule: "R1" | "R2" | "R3" | "R4";
  type: "followup_orcamento" | "pos_venda" | "retorno_comercial" | "confirmar_agendamento";
  title: string;
  reason: string;
  dueDate: DateOnly;
  quoteId?: string;
  serviceId?: string;
  appointmentId?: string;
};

const RETURN_SERVICE_TYPES = new Set(["troca_pneus", "alinhamento"]);

/** Tarefas que as regras R1–R4 exigem, dados os fatos atuais. */
export function computeAutoTasks(
  facts: { quotes: QuoteFact[]; services: ServiceFact[]; appointments: AppointmentFact[] },
  today: DateOnly,
): DesiredTask[] {
  const desired: DesiredTask[] = [];

  for (const q of facts.quotes) {
    if (q.status !== "enviado" || !q.sentAt) continue;
    const sentDay = storeDateOf(q.sentAt);
    desired.push({
      customerId: q.customerId,
      autoRule: "R1",
      type: "followup_orcamento",
      title: "Retomar orçamento",
      reason: `Orçamento de ${formatMoney(q.total)} enviado em ${formatDate(sentDay)} sem resposta`,
      dueDate: addDays(sentDay, QUOTE_FOLLOWUP_DAYS),
      quoteId: q.id,
    });
  }

  for (const s of facts.services) {
    const day = storeDateOf(s.performedAt);
    desired.push({
      customerId: s.customerId,
      autoRule: "R2",
      type: "pos_venda",
      title: "Pós-venda",
      reason: `Perguntar se ficou tudo certo com: ${s.description} (${formatDate(day)})`,
      dueDate: addDays(day, POST_SALE_DAYS),
      serviceId: s.id,
    });
    if (RETURN_SERVICE_TYPES.has(s.type)) {
      desired.push({
        customerId: s.customerId,
        autoRule: "R3",
        type: "retorno_comercial",
        title: "Oferecer rodízio e alinhamento",
        reason: `${serviceTypeLabel[s.type] ?? "Serviço"} feito em ${formatDate(day)}: hora de revisar`,
        dueDate: addDays(day, COMMERCIAL_RETURN_DAYS),
        serviceId: s.id,
      });
    }
  }

  for (const a of facts.appointments) {
    const day = storeDateOf(a.scheduledAt);
    // Só agendamentos futuros (ou de hoje) ainda não confirmados.
    if (a.status !== "agendado" || day < today) continue;
    desired.push({
      customerId: a.customerId,
      autoRule: "R4",
      type: "confirmar_agendamento",
      title: "Confirmar agendamento",
      reason: `Agendamento de ${(serviceTypeLabel[a.serviceType] ?? "serviço").toLowerCase()} em ${formatDate(day)} às ${formatTime(a.scheduledAt)}`,
      dueDate: addDays(day, -1),
      appointmentId: a.id,
    });
  }

  return desired;
}

/** Tarefas automáticas pendentes cuja condição deixou de valer (§7.1: cancelar). */
export function staleAutoTasks(
  pending: PendingAutoTask[],
  facts: { quotes: QuoteFact[]; appointments: AppointmentFact[] },
): string[] {
  const quoteStatus = new Map(facts.quotes.map((q) => [q.id, q.status]));
  const appointmentStatus = new Map(facts.appointments.map((a) => [a.id, a.status]));
  return pending
    .filter((t) => {
      if (t.autoRule === "R1") return !t.quoteId || quoteStatus.get(t.quoteId) !== "enviado";
      if (t.autoRule === "R4") {
        return !t.appointmentId || appointmentStatus.get(t.appointmentId) !== "agendado";
      }
      return false;
    })
    .map((t) => t.id);
}

/**
 * Sincroniza as tarefas automáticas no banco (todas ou só de um cliente).
 * Precisa de um banco com transação (withTransactionalDb ou a transação de quem chama).
 */
export async function syncAutoTasks(
  db: Db,
  today: DateOnly,
  options: { customerId?: string; agentEventId?: string } = {},
): Promise<{ created: number; cancelled: number }> {
  return db.transaction(async (tx) => {
    // Filtro opcional por cliente (undefined = sem filtro).
    const byCustomer = (col: AnyPgColumn) =>
      options.customerId ? eq(col, options.customerId) : undefined;

    const [quoteRows, serviceRows, appointmentRows, pendingRows] = await Promise.all([
      tx
        .select({
          id: quotes.id,
          customerId: quotes.customerId,
          status: quotes.status,
          sentAt: quotes.sentAt,
          total: quotes.total,
        })
        .from(quotes)
        .where(byCustomer(quotes.customerId)),
      tx
        .select({
          id: services.id,
          customerId: services.customerId,
          type: services.type,
          description: services.description,
          performedAt: services.performedAt,
        })
        .from(services)
        .where(byCustomer(services.customerId)),
      tx
        .select({
          id: appointments.id,
          customerId: appointments.customerId,
          status: appointments.status,
          scheduledAt: appointments.scheduledAt,
          serviceType: appointments.serviceType,
        })
        .from(appointments)
        .where(byCustomer(appointments.customerId)),
      tx
        .select({
          id: tasks.id,
          autoRule: tasks.autoRule,
          quoteId: tasks.quoteId,
          appointmentId: tasks.appointmentId,
        })
        .from(tasks)
        .where(
          and(
            eq(tasks.status, "pendente"),
            isNotNull(tasks.autoRule),
            byCustomer(tasks.customerId),
          ),
        ),
    ]);

    const facts = { quotes: quoteRows, services: serviceRows, appointments: appointmentRows };
    const desired = computeAutoTasks(facts, today);
    const actor = options.agentEventId ? ("agente" as const) : ("sistema" as const);

    let created: { id: string }[] = [];
    if (desired.length) {
      created = await tx
        .insert(tasks)
        .values(desired.map((d) => ({ ...d, source: "sistema" as const })))
        .onConflictDoNothing()
        .returning({ id: tasks.id });
    }

    const staleIds = staleAutoTasks(
      pendingRows.map((p) => ({ ...p, autoRule: p.autoRule ?? "" })),
      facts,
    );
    let cancelled: { id: string }[] = [];
    if (staleIds.length) {
      cancelled = await tx
        .update(tasks)
        .set({ status: "cancelada" })
        .where(and(inArray(tasks.id, staleIds), eq(tasks.status, "pendente")))
        .returning({ id: tasks.id });
    }

    const audits = [
      ...created.map((t) => ({
        entityType: "task",
        entityId: t.id,
        action: "create" as const,
        actorType: actor,
        agentEventId: options.agentEventId ?? null,
        after: { origem: "regra automática" },
      })),
      ...cancelled.map((t) => ({
        entityType: "task",
        entityId: t.id,
        action: "update" as const,
        actorType: actor,
        agentEventId: options.agentEventId ?? null,
        before: { status: "pendente" },
        after: { status: "cancelada", motivo: "condição da regra deixou de valer" },
      })),
    ];
    if (audits.length) await tx.insert(auditLog).values(audits);

    return { created: created.length, cancelled: cancelled.length };
  });
}
