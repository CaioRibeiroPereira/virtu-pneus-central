// Painel "Hoje" (§7.2): o que o dono precisa fazer, em ordem de urgência.
//  1. faixa "Revisar sugestões do Vito (N)"   2. Atrasados (mais antigo primeiro)
//  3. Para hoje (agendamentos por horário + tarefas)   4. Próximos 7 dias   5. "Tudo em dia"
// assembleToday é puro (testável); loadTodayPanel lê o banco.
import { and, asc, count, eq, gte, inArray, lt, lte } from "drizzle-orm";
import type { Db } from "@/db";
import { appointments, customers, employees, reviewItems, tasks } from "@/db/schema";
import { addDays, diffInDays, formatTime, storeTimeToUtc, type DateOnly } from "@/lib/dates";
import { serviceTypeLabel } from "@/lib/labels";
import { UPCOMING_DAYS } from "./config";
import { syncAutoTasks } from "./auto-tasks";

export type TodayTask = {
  kind: "task";
  id: string;
  customerId: string;
  customerName: string;
  phoneE164: string | null;
  type: string;
  title: string;
  reason: string;
  dueDate: DateOnly;
  viaAgent: boolean;
  /** Funcionário responsável (D58). */
  assigneeName?: string | null;
};

export type TodayAppointment = {
  kind: "appointment";
  id: string;
  customerId: string;
  customerName: string;
  phoneE164: string | null;
  title: string;
  status: string;
  scheduledAt: Date;
  time: string;
  viaAgent: boolean;
};

export type TodayItem = (TodayTask & { daysOverdue: number }) | TodayAppointment;

export type TodayPanel = {
  today: DateOnly;
  pendingReviews: number;
  overdue: (TodayTask & { daysOverdue: number })[];
  dueToday: TodayItem[];
  upcoming: (TodayTask & { daysOverdue: number })[];
  allClear: boolean;
};

export function assembleToday(input: {
  today: DateOnly;
  tasks: TodayTask[];
  appointments: TodayAppointment[];
  pendingReviews: number;
}): TodayPanel {
  const { today } = input;
  const limit = addDays(today, UPCOMING_DAYS);
  const withDelay = (t: TodayTask) => ({
    ...t,
    daysOverdue: Math.max(0, diffInDays(t.dueDate, today)),
  });
  const byDue = (a: TodayTask, b: TodayTask) => a.dueDate.localeCompare(b.dueDate);

  const overdue = input.tasks
    .filter((t) => t.dueDate < today)
    .sort(byDue)
    .map(withDelay);
  const todayTasks = input.tasks.filter((t) => t.dueDate === today).map(withDelay);
  const todayAppointments = [...input.appointments].sort(
    (a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime(),
  );
  const upcoming = input.tasks
    .filter((t) => t.dueDate > today && t.dueDate <= limit)
    .sort(byDue)
    .map(withDelay);

  const dueToday: TodayItem[] = [...todayAppointments, ...todayTasks];
  return {
    today,
    pendingReviews: input.pendingReviews,
    overdue,
    dueToday,
    upcoming,
    allClear: !input.pendingReviews && !overdue.length && !dueToday.length,
  };
}

/** Lê o banco e monta o painel. Antes, sincroniza as regras automáticas (§7.1). */
export async function loadTodayPanel(db: Db, today: DateOnly): Promise<TodayPanel> {
  await syncAutoTasks(db, today);
  const limit = addDays(today, UPCOMING_DAYS);
  const dayStart = storeTimeToUtc(today, "00:00");
  const nextDayStart = storeTimeToUtc(addDays(today, 1), "00:00");

  const [taskRows, appointmentRows, [{ value: pendingReviews }]] = await Promise.all([
    db
      .select({
        id: tasks.id,
        customerId: tasks.customerId,
        customerName: customers.name,
        phoneE164: customers.phoneE164,
        type: tasks.type,
        title: tasks.title,
        reason: tasks.reason,
        dueDate: tasks.dueDate,
        source: tasks.source,
        assigneeName: employees.name,
      })
      .from(tasks)
      .innerJoin(customers, eq(customers.id, tasks.customerId))
      .leftJoin(employees, eq(employees.id, tasks.assigneeId))
      .where(and(eq(tasks.status, "pendente"), lte(tasks.dueDate, limit)))
      .orderBy(asc(tasks.dueDate)),
    db
      .select({
        id: appointments.id,
        customerId: appointments.customerId,
        customerName: customers.name,
        phoneE164: customers.phoneE164,
        serviceType: appointments.serviceType,
        status: appointments.status,
        scheduledAt: appointments.scheduledAt,
        source: appointments.source,
      })
      .from(appointments)
      .innerJoin(customers, eq(customers.id, appointments.customerId))
      .where(
        and(
          gte(appointments.scheduledAt, dayStart),
          lt(appointments.scheduledAt, nextDayStart),
          inArray(appointments.status, ["agendado", "confirmado"]),
        ),
      ),
    db.select({ value: count() }).from(reviewItems).where(eq(reviewItems.status, "pendente")),
  ]);

  return assembleToday({
    today,
    pendingReviews,
    tasks: taskRows.map(({ source, ...t }) => ({
      kind: "task",
      ...t,
      viaAgent: source === "agente",
    })),
    appointments: appointmentRows.map(({ source, serviceType, ...a }) => ({
      kind: "appointment",
      ...a,
      title: serviceTypeLabel[serviceType] ?? "Serviço",
      time: formatTime(a.scheduledAt),
      viaAgent: source === "agente",
    })),
  });
}
