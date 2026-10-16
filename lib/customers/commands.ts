// Ações do gestor sobre clientes, tarefas, orçamentos, serviços e agendamentos.
// Cada uma roda numa transação: grava a mudança, a auditoria (actor = gestor) e
// ressincroniza as regras automáticas do cliente (§7.1) — tudo ou nada.
import { and, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { appointments, auditLog, customers, quotes, services, tasks, vehicles } from "@/db/schema";
import { storeTimeToUtc, todayInStore, type DateOnly } from "@/lib/dates";
import { normalizePhone } from "@/lib/phone";
import { syncAutoTasks } from "@/lib/rules/auto-tasks";
import { normalizePlate } from "@/lib/search";
import { consumeForService, type ServiceItem } from "@/lib/oficina/inventory";
import type { CustomerFormData } from "./input";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

async function audit(
  tx: Tx,
  entityType: string,
  entityId: string,
  action: "create" | "update",
  after: unknown,
  before?: unknown,
) {
  await tx.insert(auditLog).values({
    entityType,
    entityId,
    action,
    actorType: "gestor",
    before: before ?? null,
    after,
  });
}

export type CreateCustomerResult =
  | { ok: true; id: string }
  | { ok: false; reason: "invalid_phone" }
  | { ok: false; reason: "duplicate_phone"; existingCustomerId: string };

export async function createCustomer(
  db: Db,
  data: CustomerFormData,
  vehicle: { vehicleModel?: string; vehiclePlate?: string; vehicleTire?: string },
): Promise<CreateCustomerResult> {
  const phone = normalizePhone(data.phone);
  if (!phone) return { ok: false, reason: "invalid_phone" };
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.phoneE164, phone.e164));
    if (existing) return { ok: false, reason: "duplicate_phone", existingCustomerId: existing.id };

    const values = {
      name: data.name,
      phoneE164: phone.e164,
      phoneDisplay: phone.display,
      email: data.email ?? null,
      city: data.city ?? null,
      origin: data.origin,
      stage: data.stage,
      lossReason: data.stage === "perdido" ? (data.lossReason ?? null) : null,
      notes: data.notes ?? null,
      source: "gestor" as const,
    };
    // Tudo que o gestor preencheu fica protegido contra sobrescrita do agente.
    const humanEditedFields = Object.entries({ ...values, phone: values.phoneE164 })
      .filter(([k, v]) => v !== null && !["phoneE164", "phoneDisplay", "source"].includes(k))
      .map(([k]) => k);
    const [row] = await tx
      .insert(customers)
      .values({ ...values, humanEditedFields })
      .returning({ id: customers.id });
    await audit(tx, "customer", row.id, "create", { name: values.name, phone: phone.display });

    if (vehicle.vehicleModel || vehicle.vehiclePlate || vehicle.vehicleTire) {
      const [v] = await tx
        .insert(vehicles)
        .values({
          customerId: row.id,
          model: vehicle.vehicleModel ?? null,
          plate: vehicle.vehiclePlate ? normalizePlate(vehicle.vehiclePlate) : null,
          tireSize: vehicle.vehicleTire ?? null,
        })
        .returning({ id: vehicles.id });
      await audit(tx, "vehicle", v.id, "create", vehicle);
    }
    return { ok: true, id: row.id };
  });
}

async function finish(tx: Tx, customerId: string, today: DateOnly) {
  await syncAutoTasks(tx as unknown as Db, today, { customerId });
  return customerId;
}

export async function addTask(
  db: Db,
  customerId: string,
  input: {
    type: (typeof tasks.$inferInsert)["type"];
    title: string;
    reason: string;
    dueDate: string;
    assigneeId?: string;
  },
  today = todayInStore(),
) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(tasks)
      .values({ customerId, ...input, assigneeId: input.assigneeId ?? null })
      .returning({ id: tasks.id });
    await audit(tx, "task", row.id, "create", input);
    return finish(tx, customerId, today);
  });
}

export async function addQuote(
  db: Db,
  customerId: string,
  input: {
    description: string;
    total: number;
    tireSize?: string;
    quantity?: number;
    validUntil?: string;
  },
  today = todayInStore(),
) {
  return db.transaction(async (tx) => {
    const values = {
      customerId,
      description: input.description,
      total: input.total,
      tireSize: input.tireSize ?? null,
      quantity: input.quantity ?? null,
      validUntil: input.validUntil ?? null,
      status: "enviado" as const,
      sentAt: new Date(),
    };
    const [row] = await tx.insert(quotes).values(values).returning({ id: quotes.id });
    await audit(tx, "quote", row.id, "create", {
      description: values.description,
      total: values.total,
    });
    return finish(tx, customerId, today);
  });
}

export async function addService(
  db: Db,
  customerId: string,
  input: {
    type: (typeof services.$inferInsert)["type"];
    description: string;
    date: string;
    total?: number;
    km?: number;
    employeeId?: string;
    /** Itens do estoque usados: baixa automática na mesma transação (D58). */
    items?: ServiceItem[];
  },
  today = todayInStore(),
) {
  return db.transaction(async (tx) => {
    const values = {
      customerId,
      type: input.type,
      description: input.description,
      performedAt: storeTimeToUtc(input.date, "12:00"),
      total: input.total ?? null,
      km: input.km ?? null,
      employeeId: input.employeeId ?? null,
    };
    const [row] = await tx.insert(services).values(values).returning({ id: services.id });
    // Falta de estoque lança StockError: a transação inteira é desfeita (nem o serviço fica).
    if (input.items?.length) await consumeForService(tx, row.id, input.items);
    await audit(tx, "service", row.id, "create", {
      description: values.description,
      date: input.date,
      employeeId: values.employeeId,
      items: input.items ?? [],
    });
    return finish(tx, customerId, today);
  });
}

export async function addAppointment(
  db: Db,
  customerId: string,
  input: {
    date: string;
    time: string;
    serviceType: (typeof appointments.$inferInsert)["serviceType"];
  },
  today = todayInStore(),
) {
  return db.transaction(async (tx) => {
    const values = {
      customerId,
      scheduledAt: storeTimeToUtc(input.date, input.time),
      serviceType: input.serviceType,
      status: "agendado" as const,
    };
    const [row] = await tx.insert(appointments).values(values).returning({ id: appointments.id });
    await audit(tx, "appointment", row.id, "create", input);
    return finish(tx, customerId, today);
  });
}

export async function setQuoteStatus(
  db: Db,
  quoteId: string,
  status: "aprovado" | "recusado",
  reason?: string,
  today = todayInStore(),
) {
  return db.transaction(async (tx) => {
    const [quote] = await tx.select().from(quotes).where(eq(quotes.id, quoteId));
    if (!quote) throw new Error("Orçamento não encontrado");
    await tx
      .update(quotes)
      .set({
        status,
        respondedAt: new Date(),
        lossReason: status === "recusado" ? (reason ?? null) : null,
      })
      .where(eq(quotes.id, quoteId));
    await audit(tx, "quote", quoteId, "update", { status }, { status: quote.status });
    return finish(tx, quote.customerId, today);
  });
}

export async function setTaskStatus(db: Db, taskId: string, status: "concluida" | "pendente") {
  return db.transaction(async (tx) => {
    const [task] = await tx.select().from(tasks).where(eq(tasks.id, taskId));
    if (!task) throw new Error("Tarefa não encontrada");
    await tx
      .update(tasks)
      .set({ status, completedAt: status === "concluida" ? new Date() : null })
      .where(eq(tasks.id, taskId));
    await audit(tx, "task", taskId, "update", { status }, { status: task.status });
    return task.customerId;
  });
}

export async function snoozeTask(db: Db, taskId: string, newDue: DateOnly) {
  return db.transaction(async (tx) => {
    const [task] = await tx
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.status, "pendente")));
    if (!task) throw new Error("Tarefa não encontrada ou já concluída");
    await tx
      .update(tasks)
      .set({ dueDate: newDue, snoozedCount: task.snoozedCount + 1 })
      .where(eq(tasks.id, taskId));
    await audit(tx, "task", taskId, "update", { dueDate: newDue }, { dueDate: task.dueDate });
    return task.customerId;
  });
}

export async function setAppointmentStatus(
  db: Db,
  appointmentId: string,
  status: (typeof appointments.$inferInsert)["status"] & string,
  today = todayInStore(),
) {
  return db.transaction(async (tx) => {
    const [appt] = await tx.select().from(appointments).where(eq(appointments.id, appointmentId));
    if (!appt) throw new Error("Agendamento não encontrado");
    await tx.update(appointments).set({ status }).where(eq(appointments.id, appointmentId));
    await audit(tx, "appointment", appointmentId, "update", { status }, { status: appt.status });
    return finish(tx, appt.customerId, today);
  });
}
