// Edição do cliente pelo gestor (§9 "Novo/editar cliente"):
//  - trava otimista: só grava se a versão ainda é a que o gestor abriu (senão, conflito/409);
//  - registra os campos alterados em human_edited_fields (o agente não os sobrescreve sem revisão);
//  - confirma o cliente provisório criado pelo agente;
//  - grava a auditoria na mesma transação.
import { and, eq, ne } from "drizzle-orm";
import type { Db } from "@/db";
import { auditLog, customers } from "@/db/schema";
import { normalizePhone } from "@/lib/phone";

type CustomerRow = typeof customers.$inferSelect;

export type CustomerEdit = Partial<
  Pick<CustomerRow, "name" | "email" | "city" | "origin" | "stage" | "lossReason" | "notes">
> & { phone?: string };

export type UpdateResult =
  | { ok: true; version: number; changed: string[] }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "conflict"; current: CustomerRow }
  | { ok: false; reason: "invalid_phone" }
  | { ok: false; reason: "duplicate_phone"; existingCustomerId: string }
  | { ok: false; reason: "loss_reason_required" };

export async function updateCustomerByGestor(
  db: Db,
  customerId: string,
  expectedVersion: number,
  edit: CustomerEdit,
): Promise<UpdateResult> {
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(customers).where(eq(customers.id, customerId));
    if (!current) return { ok: false, reason: "not_found" };
    if (current.version !== expectedVersion) return { ok: false, reason: "conflict", current };

    const { phone, ...fields } = edit;
    const changes: Partial<typeof customers.$inferInsert> = {};
    for (const [key, value] of Object.entries(fields) as [keyof typeof fields, unknown][]) {
      if (value !== undefined && value !== current[key]) Object.assign(changes, { [key]: value });
    }

    if (phone !== undefined) {
      const normalized = normalizePhone(phone);
      if (!normalized) return { ok: false, reason: "invalid_phone" };
      if (normalized.e164 !== current.phoneE164) {
        const [other] = await tx
          .select({ id: customers.id })
          .from(customers)
          .where(and(eq(customers.phoneE164, normalized.e164), ne(customers.id, customerId)));
        if (other) return { ok: false, reason: "duplicate_phone", existingCustomerId: other.id };
        changes.phoneE164 = normalized.e164;
        changes.phoneDisplay = normalized.display;
      }
    }

    const finalStage = changes.stage ?? current.stage;
    const finalLoss = changes.lossReason ?? current.lossReason;
    if (finalStage === "perdido" && !finalLoss?.trim()) {
      return { ok: false, reason: "loss_reason_required" };
    }

    const changed = Object.keys(changes);
    if (!changed.length && !current.isProvisional) {
      return { ok: true, version: current.version, changed: [] };
    }

    const humanEdited = [...new Set([...current.humanEditedFields, ...changed.map(fieldName)])];
    const [updated] = await tx
      .update(customers)
      .set({ ...changes, humanEditedFields: humanEdited, isProvisional: false, version: current.version + 1 })
      .where(and(eq(customers.id, customerId), eq(customers.version, expectedVersion)))
      .returning({ version: customers.version });
    // Outra gravação passou na frente entre a leitura e o UPDATE.
    if (!updated) {
      const [latest] = await tx.select().from(customers).where(eq(customers.id, customerId));
      return { ok: false, reason: "conflict", current: latest };
    }

    await tx.insert(auditLog).values({
      entityType: "customer",
      entityId: customerId,
      action: "update",
      actorType: "gestor",
      before: Object.fromEntries(changed.map((k) => [k, current[k as keyof CustomerRow]])),
      after: { ...changes, ...(current.isProvisional ? { provisional: false } : {}) },
    });
    return { ok: true, version: updated.version, changed };
  });
}

/** Nome do campo como o agente o conhece (phoneE164/phoneDisplay → phone). */
function fieldName(key: string): string {
  return key.startsWith("phone") ? "phone" : key;
}
