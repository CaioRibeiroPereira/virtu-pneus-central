// Leituras para as telas de clientes. Funcionam com qualquer `Db` (HTTP ou transacional).
import { and, asc, count, desc, eq, inArray, lte } from "drizzle-orm";
import type { Db } from "@/db";
import {
  agentEvents,
  appointments,
  customers,
  interactions,
  quotes,
  reviewItems,
  services,
  tasks,
  vehicles,
} from "@/db/schema";
import type { DateOnly } from "@/lib/dates";
import { matchesSearch } from "@/lib/search";
import { buildTimeline } from "./timeline";

export type CustomerListItem = {
  id: string;
  name: string;
  phoneDisplay: string | null;
  stage: string;
  isProvisional: boolean;
  vehicle: string | null;
  nextAction: { title: string; dueDate: DateOnly } | null;
  needsAction: boolean;
};

export async function listCustomers(
  db: Db,
  filters: { q?: string; stage?: string; needsAction?: boolean },
  today: DateOnly,
): Promise<CustomerListItem[]> {
  const [rows, vehicleRows, pending, reviews] = await Promise.all([
    db.select().from(customers).orderBy(asc(customers.name)),
    db
      .select({ customerId: vehicles.customerId, model: vehicles.model, plate: vehicles.plate })
      .from(vehicles),
    db
      .select({ customerId: tasks.customerId, title: tasks.title, dueDate: tasks.dueDate })
      .from(tasks)
      .where(eq(tasks.status, "pendente"))
      .orderBy(asc(tasks.dueDate)),
    db
      .select({ customerId: agentEvents.customerId })
      .from(reviewItems)
      .innerJoin(agentEvents, eq(agentEvents.id, reviewItems.agentEventId))
      .where(eq(reviewItems.status, "pendente")),
  ]);

  const vehiclesBy = new Map<string, { model: string | null; plate: string | null }[]>();
  for (const v of vehicleRows)
    vehiclesBy.set(v.customerId, [...(vehiclesBy.get(v.customerId) ?? []), v]);
  const nextBy = new Map<string, { title: string; dueDate: string }>();
  for (const t of pending) if (!nextBy.has(t.customerId)) nextBy.set(t.customerId, t);
  const withReview = new Set(reviews.map((r) => r.customerId));

  return rows
    .map((c) => {
      const vs = vehiclesBy.get(c.id) ?? [];
      const next = nextBy.get(c.id) ?? null;
      return {
        customer: c,
        plates: vs.map((v) => v.plate).filter((p): p is string => !!p),
        item: {
          id: c.id,
          name: c.name,
          phoneDisplay: c.phoneDisplay,
          stage: c.stage,
          isProvisional: c.isProvisional,
          vehicle: vs[0]?.model ?? null,
          nextAction: next,
          needsAction: (!!next && next.dueDate <= today) || withReview.has(c.id) || c.isProvisional,
        },
      };
    })
    .filter(({ customer, plates, item }) => {
      if (filters.stage && customer.stage !== filters.stage) return false;
      if (filters.needsAction && !item.needsAction) return false;
      return matchesSearch(
        { name: customer.name, phoneE164: customer.phoneE164, email: customer.email, plates },
        filters.q ?? "",
      );
    })
    .map(({ item }) => item);
}

export async function pendingReviewCount(db: Db): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(reviewItems)
    .where(eq(reviewItems.status, "pendente"));
  return row.n;
}

export async function getCustomerDetail(db: Db, id: string, today: DateOnly) {
  const [customer] = await db.select().from(customers).where(eq(customers.id, id));
  if (!customer) return null;

  const [
    vehicleRows,
    quoteRows,
    serviceRows,
    appointmentRows,
    taskRows,
    interactionRows,
    eventRows,
  ] = await Promise.all([
    db.select().from(vehicles).where(eq(vehicles.customerId, id)),
    db.select().from(quotes).where(eq(quotes.customerId, id)).orderBy(desc(quotes.createdAt)),
    db.select().from(services).where(eq(services.customerId, id)),
    db.select().from(appointments).where(eq(appointments.customerId, id)),
    db.select().from(tasks).where(eq(tasks.customerId, id)).orderBy(asc(tasks.dueDate)),
    db.select().from(interactions).where(eq(interactions.customerId, id)),
    db
      .select({
        id: agentEvents.id,
        evidence: agentEvents.evidence,
        receivedAt: agentEvents.receivedAt,
        type: agentEvents.type,
        status: agentEvents.status,
      })
      .from(agentEvents)
      .where(eq(agentEvents.customerId, id)),
  ]);

  const eventIds = eventRows.map((e) => e.id);
  const pendingReviews = eventIds.length
    ? await db
        .select({
          id: reviewItems.id,
          agentEventId: reviewItems.agentEventId,
          reason: reviewItems.reason,
        })
        .from(reviewItems)
        .where(and(eq(reviewItems.status, "pendente"), inArray(reviewItems.agentEventId, eventIds)))
    : [];
  const eventById = new Map(eventRows.map((e) => [e.id, e]));

  const timeline = buildTimeline({
    now: new Date(),
    interactions: interactionRows,
    quotes: quoteRows,
    services: serviceRows,
    appointments: appointmentRows,
    completedTasks: taskRows.filter((t) => t.status === "concluida"),
    pendingSuggestions: pendingReviews.map((r) => {
      const e = eventById.get(r.agentEventId);
      return {
        id: r.id,
        type: e?.type ?? "",
        receivedAt: e?.receivedAt ?? new Date(),
        evidence: e?.evidence ?? null,
        reason: r.reason,
      };
    }),
    evidenceByEvent: new Map(eventRows.map((e) => [e.id, e.evidence])),
  });

  const pendingTasks = taskRows.filter((t) => t.status === "pendente");
  return {
    customer,
    vehicles: vehicleRows,
    openQuotes: quoteRows.filter((q) => q.status === "enviado"),
    pendingTasks,
    overdueCount: pendingTasks.filter((t) => t.dueDate < today).length,
    nextAppointment:
      appointmentRows
        .filter((a) => a.scheduledAt > new Date() && ["agendado", "confirmado"].includes(a.status))
        .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())[0] ?? null,
    pendingReviewCount: pendingReviews.length,
    timeline,
  };
}

/** Clientes com tarefas vencidas até hoje (para o contador do menu, se necessário). */
export async function overdueTaskCount(db: Db, today: DateOnly): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(tasks)
    .where(and(eq(tasks.status, "pendente"), lte(tasks.dueDate, today)));
  return row.n;
}
