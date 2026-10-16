// Aplica um evento do agente nas tabelas. Usado pelo processador (aplicação automática)
// e, na Fase 4, pela aprovação na fila de revisão. Sempre grava a auditoria junto.
import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@/db";
import {
  appointments,
  auditLog,
  customers,
  interactions,
  quotes,
  services,
  tasks,
  vehicles,
} from "@/db/schema";
import { todayInStore, type DateOnly } from "@/lib/dates";
import { advanceStage } from "@/lib/customers/stage";
import { normalizePlate } from "@/lib/search";
import type { AgentEvent } from "./schema";

export type AppliedEntity = { entity: string; id: string };

export type ApplyContext = {
  customerId: string;
  agentEventId: string;
  /** Quem decidiu aplicar: o próprio agente (automático) ou o gestor (aprovação na fila). */
  actor: "agente" | "gestor";
  /** Na aprovação pelo gestor, permite sobrescrever campos já preenchidos. */
  overwrite?: boolean;
  /** Dia da loja (prazo de tarefa sugerida no passado vira hoje). */
  today?: DateOnly;
};

/** Campos do cliente que um evento customer.upserted pode preencher. */
export const CUSTOMER_FIELDS = ["name", "email", "city", "origin"] as const;
type CustomerField = (typeof CUSTOMER_FIELDS)[number];

type CustomerRow = typeof customers.$inferSelect;

/**
 * Compara o que o agente propõe com o cadastro atual.
 *  - fill: campos vazios que podem ser preenchidos (baixo risco);
 *  - conflicts: campos já preenchidos e editados pelo gestor, com valor diferente (vão para revisão);
 *  - ignored: campos já preenchidos (não pelo gestor) com valor diferente — o agente só preenche vazios.
 */
export function diffCustomerFields(
  current: Pick<CustomerRow, CustomerField | "humanEditedFields" | "isProvisional">,
  proposed: Partial<Record<CustomerField, string>>,
) {
  const fill: Partial<Record<CustomerField, string>> = {};
  const conflicts: CustomerField[] = [];
  const ignored: CustomerField[] = [];
  for (const field of CUSTOMER_FIELDS) {
    const value = proposed[field];
    if (value === undefined) continue;
    const now = current[field];
    // Nome de cliente provisório é um rótulo criado pelo sistema: pode ser trocado.
    const isEmpty = now === null || now === "" || (field === "name" && current.isProvisional);
    if (isEmpty) fill[field] = value;
    else if (String(now) !== value) {
      if (current.humanEditedFields.includes(field)) conflicts.push(field);
      else ignored.push(field);
    }
  }
  return { fill, conflicts, ignored };
}

async function audit(
  db: Db,
  ctx: ApplyContext,
  entry: {
    entityType: string;
    entityId: string;
    action: "create" | "update";
    before?: unknown;
    after?: unknown;
  },
) {
  await db.insert(auditLog).values({
    ...entry,
    actorType: ctx.actor,
    agentEventId: ctx.agentEventId,
    before: entry.before ?? null,
    after: entry.after ?? null,
  });
}

async function vehicleIdByPlate(db: Db, customerId: string, plate?: string) {
  if (!plate) return null;
  const [row] = await db
    .select({ id: vehicles.id })
    .from(vehicles)
    .where(and(eq(vehicles.customerId, customerId), eq(vehicles.plate, normalizePlate(plate))));
  return row?.id ?? null;
}

const origin = (ctx: ApplyContext) => ({
  source: "agente" as const,
  agentEventId: ctx.agentEventId,
});

export async function applyAgentEvent(
  db: Db,
  event: AgentEvent,
  ctx: ApplyContext,
): Promise<AppliedEntity[]> {
  switch (event.type) {
    case "customer.upserted": {
      const [current] = await db.select().from(customers).where(eq(customers.id, ctx.customerId));
      const { fill, conflicts } = diffCustomerFields(current, event.data);
      // Os valores já foram validados pelo schema zod (origin é um dos valores do enum).
      const changes = (
        ctx.overwrite
          ? { ...fill, ...Object.fromEntries(conflicts.map((f) => [f, event.data[f]])) }
          : fill
      ) as Partial<Pick<typeof customers.$inferInsert, CustomerField>>;
      if (!Object.keys(changes).length) return [];
      const before = Object.fromEntries(
        Object.keys(changes).map((k) => [k, current[k as CustomerField]]),
      );
      await db
        .update(customers)
        .set({ ...changes, version: current.version + 1 })
        .where(eq(customers.id, ctx.customerId));
      await audit(db, ctx, {
        entityType: "customer",
        entityId: ctx.customerId,
        action: "update",
        before,
        after: changes,
      });
      return [{ entity: "customer", id: ctx.customerId }];
    }

    case "vehicle.identified": {
      const plate = event.data.plate ? normalizePlate(event.data.plate) : undefined;
      const fields = {
        plate,
        model: event.data.model,
        year: event.data.year,
        tireSize: event.data.tire_size,
      };
      const existing = await db
        .select()
        .from(vehicles)
        .where(eq(vehicles.customerId, ctx.customerId));
      const match = plate
        ? existing.find((v) => v.plate === plate)
        : existing.length === 1
          ? existing[0]
          : undefined;
      if (match) {
        const fill = Object.fromEntries(
          Object.entries(fields).filter(
            ([k, v]) => v !== undefined && match[k as keyof typeof match] == null,
          ),
        );
        if (!Object.keys(fill).length) return [];
        await db.update(vehicles).set(fill).where(eq(vehicles.id, match.id));
        await audit(db, ctx, {
          entityType: "vehicle",
          entityId: match.id,
          action: "update",
          after: fill,
        });
        return [{ entity: "vehicle", id: match.id }];
      }
      const [row] = await db
        .insert(vehicles)
        .values({ customerId: ctx.customerId, ...fields, ...origin(ctx) })
        .returning({ id: vehicles.id });
      await audit(db, ctx, {
        entityType: "vehicle",
        entityId: row.id,
        action: "create",
        after: fields,
      });
      return [{ entity: "vehicle", id: row.id }];
    }

    case "interaction.logged": {
      const values = {
        customerId: ctx.customerId,
        channel: event.data.channel,
        occurredAt: new Date(event.occurred_at),
        summary: event.data.summary,
        evidence: event.evidence ?? null,
        ...origin(ctx),
      };
      const [row] = await db.insert(interactions).values(values).returning({ id: interactions.id });
      await audit(db, ctx, {
        entityType: "interaction",
        entityId: row.id,
        action: "create",
        after: { summary: values.summary },
      });
      return [{ entity: "interaction", id: row.id }];
    }

    case "quote.created": {
      const values = {
        customerId: ctx.customerId,
        vehicleId: await vehicleIdByPlate(db, ctx.customerId, event.data.vehicle_plate),
        description: event.data.description,
        tireSize: event.data.tire_size ?? null,
        quantity: event.data.quantity ?? null,
        total: event.data.total,
        status: "enviado" as const,
        sentAt: new Date(event.occurred_at),
        validUntil: event.data.valid_until ?? null,
        ...origin(ctx),
      };
      const [row] = await db.insert(quotes).values(values).returning({ id: quotes.id });
      await audit(db, ctx, {
        entityType: "quote",
        entityId: row.id,
        action: "create",
        after: { description: values.description, total: values.total, status: values.status },
      });
      await advanceStage(db, ctx.customerId, "orcamento_enviado", ctx.agentEventId);
      return [{ entity: "quote", id: row.id }];
    }

    case "task.suggested": {
      // Prazo no passado (a IA errou a data ou a conversa chegou atrasada): vira hoje, para a
      // ação não nascer atrasada.
      const today = ctx.today ?? todayInStore();
      const values = {
        customerId: ctx.customerId,
        type: event.data.type,
        title: event.data.title,
        reason: event.data.reason,
        dueDate: event.data.due_date < today ? today : event.data.due_date,
        ...origin(ctx),
      };
      const [row] = await db.insert(tasks).values(values).returning({ id: tasks.id });
      await audit(db, ctx, {
        entityType: "task",
        entityId: row.id,
        action: "create",
        after: { title: values.title, dueDate: values.dueDate },
      });
      return [{ entity: "task", id: row.id }];
    }

    case "appointment.requested": {
      const values = {
        customerId: ctx.customerId,
        scheduledAt: new Date(event.data.scheduled_at),
        serviceType: event.data.service_type,
        status: "agendado" as const,
        ...origin(ctx),
      };
      const [row] = await db.insert(appointments).values(values).returning({ id: appointments.id });
      await audit(db, ctx, {
        entityType: "appointment",
        entityId: row.id,
        action: "create",
        after: { scheduledAt: values.scheduledAt.toISOString(), serviceType: values.serviceType },
      });
      await advanceStage(db, ctx.customerId, "agendado", ctx.agentEventId);
      return [{ entity: "appointment", id: row.id }];
    }

    case "quote.status_changed": {
      const quoteId = await resolveQuoteForStatusChange(db, ctx.customerId, event.data.quote_id);
      if (!quoteId) throw new Error("Nenhum orçamento enviado encontrado para este cliente.");
      const [before] = await db
        .select({ status: quotes.status })
        .from(quotes)
        .where(eq(quotes.id, quoteId));
      const changes = {
        status: event.data.status,
        respondedAt: new Date(event.occurred_at),
        lossReason: event.data.status === "recusado" ? (event.data.reason ?? null) : null,
      };
      await db.update(quotes).set(changes).where(eq(quotes.id, quoteId));
      await audit(db, ctx, {
        entityType: "quote",
        entityId: quoteId,
        action: "update",
        before,
        after: { status: changes.status },
      });
      return [{ entity: "quote", id: quoteId }];
    }

    case "service.completed": {
      const values = {
        customerId: ctx.customerId,
        type: event.data.type,
        description: event.data.description,
        performedAt: new Date(event.data.performed_at),
        total: event.data.total ?? null,
        km: event.data.km ?? null,
        ...origin(ctx),
      };
      const [row] = await db.insert(services).values(values).returning({ id: services.id });
      await audit(db, ctx, {
        entityType: "service",
        entityId: row.id,
        action: "create",
        after: { description: values.description },
      });
      await advanceStage(db, ctx.customerId, "cliente", ctx.agentEventId);
      return [{ entity: "service", id: row.id }];
    }
  }
}

/** Orçamento alvo: o informado (se for do cliente) ou o último orçamento "enviado" do cliente. */
export async function resolveQuoteForStatusChange(
  db: Db,
  customerId: string,
  quoteId?: string,
): Promise<string | null> {
  const [row] = await db
    .select({ id: quotes.id })
    .from(quotes)
    .where(
      quoteId
        ? and(eq(quotes.id, quoteId), eq(quotes.customerId, customerId))
        : and(eq(quotes.customerId, customerId), eq(quotes.status, "enviado")),
    )
    .orderBy(desc(quotes.sentAt))
    .limit(1);
  return row?.id ?? null;
}
