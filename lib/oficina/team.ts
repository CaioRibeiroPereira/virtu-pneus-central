// Equipe e tabela de serviços (D58). Funcionário é só cadastro + "responsável" (um login só — D4).
import { and, asc, desc, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { auditLog, customers, employees, serviceCatalog, services, tasks } from "@/db/schema";

async function audit(
  db: Db,
  entityType: string,
  entityId: string,
  action: "create" | "update",
  after: unknown,
) {
  await db.insert(auditLog).values({ entityType, entityId, action, actorType: "gestor", after });
}

// ---------- funcionários ----------

export type EmployeeInput = { name: string; role: string; phoneDisplay?: string; active: boolean };

export async function createEmployee(db: Db, input: EmployeeInput) {
  const [row] = await db
    .insert(employees)
    .values({ ...input, phoneDisplay: input.phoneDisplay ?? null })
    .returning({ id: employees.id });
  await audit(db, "employee", row.id, "create", input);
  return row.id;
}

export async function updateEmployee(db: Db, id: string, input: EmployeeInput) {
  await db
    .update(employees)
    .set({ ...input, phoneDisplay: input.phoneDisplay ?? null })
    .where(eq(employees.id, id));
  await audit(db, "employee", id, "update", input);
}

export async function listEmployees(db: Db, opts: { activeOnly?: boolean } = {}) {
  return db
    .select()
    .from(employees)
    .where(opts.activeOnly ? eq(employees.active, true) : undefined)
    .orderBy(desc(employees.active), asc(employees.name));
}

/** Página do funcionário: ações pendentes dele e serviços que fez. */
export async function employeeDetail(db: Db, id: string) {
  const [employee] = await db.select().from(employees).where(eq(employees.id, id));
  if (!employee) return null;
  const [pending, done] = await Promise.all([
    db
      .select({
        id: tasks.id,
        title: tasks.title,
        dueDate: tasks.dueDate,
        customerId: tasks.customerId,
        customerName: customers.name,
      })
      .from(tasks)
      .innerJoin(customers, eq(customers.id, tasks.customerId))
      .where(and(eq(tasks.assigneeId, id), eq(tasks.status, "pendente")))
      .orderBy(asc(tasks.dueDate)),
    db
      .select({
        id: services.id,
        description: services.description,
        performedAt: services.performedAt,
        total: services.total,
        customerId: services.customerId,
        customerName: customers.name,
      })
      .from(services)
      .innerJoin(customers, eq(customers.id, services.customerId))
      .where(eq(services.employeeId, id))
      .orderBy(desc(services.performedAt))
      .limit(20),
  ]);
  return { employee, pending, done };
}

// ---------- tabela de serviços ----------

export type CatalogInput = {
  name: string;
  type: (typeof serviceCatalog.$inferInsert)["type"];
  price: number;
  durationMinutes?: number;
  active: boolean;
};

export async function createCatalogItem(db: Db, input: CatalogInput) {
  const [row] = await db
    .insert(serviceCatalog)
    .values({ ...input, durationMinutes: input.durationMinutes ?? null })
    .returning({ id: serviceCatalog.id });
  await audit(db, "service_catalog", row.id, "create", input);
  return row.id;
}

export async function updateCatalogItem(db: Db, id: string, input: CatalogInput) {
  await db
    .update(serviceCatalog)
    .set({ ...input, durationMinutes: input.durationMinutes ?? null })
    .where(eq(serviceCatalog.id, id));
  await audit(db, "service_catalog", id, "update", input);
}

export async function listCatalog(db: Db, opts: { activeOnly?: boolean } = {}) {
  return db
    .select()
    .from(serviceCatalog)
    .where(opts.activeOnly ? eq(serviceCatalog.active, true) : undefined)
    .orderBy(desc(serviceCatalog.active), asc(serviceCatalog.name));
}
