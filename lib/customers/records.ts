// Corrigir e excluir orçamento e serviço já registrados (D64). Tudo numa transação, com auditoria e
// as regras automáticas refeitas: o follow-up (R1), o pós-venda (R2) e o retorno (R3) acompanham o
// valor e a data corrigidos. A etapa do cliente não volta (só anda para frente — D60).
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { auditLog, products, quotes, services, stockMovements, tasks } from "@/db/schema";
import { storeDateOf, storeTimeToUtc, todayInStore } from "@/lib/dates";
import { syncAutoTasks } from "@/lib/rules/auto-tasks";
import { CommandError } from "./commands";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

async function audit(
  tx: Tx,
  entityType: string,
  entityId: string,
  action: "update" | "delete",
  before: unknown,
  after: unknown,
) {
  await tx
    .insert(auditLog)
    .values({ entityType, entityId, action, actorType: "gestor", before, after });
}

/**
 * Solta as tarefas automáticas ligadas ao registro: as pendentes saem (a regra recria com os
 * dados novos, se ainda valer); as já feitas ficam no histórico, sem a regra. Sem isso, apagar o
 * registro deixaria duas tarefas "sem origem" iguais e o índice único da D22 recusaria.
 */
async function releaseAutoTasks(tx: Tx, link: { quoteId?: string; serviceId?: string }) {
  const where = link.quoteId
    ? eq(tasks.quoteId, link.quoteId)
    : eq(tasks.serviceId, link.serviceId!);
  await tx
    .delete(tasks)
    .where(and(where, eq(tasks.status, "pendente"), sql`${tasks.autoRule} is not null`));
  await tx
    .update(tasks)
    .set({ autoRule: null })
    .where(and(where, ne(tasks.status, "pendente")));
}

// ---------- Orçamento ----------

export type QuoteEdit = {
  description: string;
  total: number;
  tireSize?: string;
  quantity?: number;
  validUntil?: string;
};

export async function updateQuote(
  db: Db,
  quoteId: string,
  input: QuoteEdit,
  today = todayInStore(),
) {
  return db.transaction(async (tx) => {
    const [quote] = await tx.select().from(quotes).where(eq(quotes.id, quoteId));
    if (!quote) throw new CommandError("Orçamento não encontrado.");
    const values = {
      description: input.description,
      total: input.total,
      tireSize: input.tireSize ?? null,
      quantity: input.quantity ?? null,
      validUntil: input.validUntil ?? null,
    };
    await tx.update(quotes).set(values).where(eq(quotes.id, quoteId));
    await audit(
      tx,
      "quote",
      quoteId,
      "update",
      { description: quote.description, total: quote.total },
      { description: values.description, total: values.total },
    );
    // O follow-up pendente cita o valor: refeito com o valor novo.
    await tx
      .delete(tasks)
      .where(
        and(eq(tasks.quoteId, quoteId), eq(tasks.status, "pendente"), eq(tasks.autoRule, "R1")),
      );
    await syncAutoTasks(tx as unknown as Db, today, { customerId: quote.customerId });
    return quote.customerId;
  });
}

export async function deleteQuote(db: Db, quoteId: string, today = todayInStore()) {
  return db.transaction(async (tx) => {
    const [quote] = await tx.select().from(quotes).where(eq(quotes.id, quoteId));
    if (!quote) throw new CommandError("Orçamento não encontrado.");
    await releaseAutoTasks(tx, { quoteId });
    await tx.delete(quotes).where(eq(quotes.id, quoteId));
    await audit(
      tx,
      "quote",
      quoteId,
      "delete",
      { description: quote.description, total: quote.total, status: quote.status },
      null,
    );
    await syncAutoTasks(tx as unknown as Db, today, { customerId: quote.customerId });
    return quote.customerId;
  });
}

// ---------- Serviço ----------

export type ServiceEdit = {
  type: (typeof services.$inferInsert)["type"];
  description: string;
  date: string;
  total?: number;
  km?: number;
  employeeId?: string;
};

export async function updateService(
  db: Db,
  serviceId: string,
  input: ServiceEdit,
  today = todayInStore(),
) {
  return db.transaction(async (tx) => {
    const [service] = await tx.select().from(services).where(eq(services.id, serviceId));
    if (!service) throw new CommandError("Serviço não encontrado.");
    // Mesmo dia: mantém a hora gravada (o Vito registra com hora); outro dia: meio-dia da loja.
    const sameDay = storeDateOf(service.performedAt) === input.date;
    const values = {
      type: input.type,
      description: input.description,
      performedAt: sameDay ? service.performedAt : storeTimeToUtc(input.date, "12:00"),
      total: input.total ?? null,
      km: input.km ?? null,
      employeeId: input.employeeId ?? null,
    };
    await tx.update(services).set(values).where(eq(services.id, serviceId));
    await audit(
      tx,
      "service",
      serviceId,
      "update",
      {
        type: service.type,
        description: service.description,
        performedAt: service.performedAt,
        total: service.total,
      },
      {
        type: values.type,
        description: values.description,
        performedAt: values.performedAt,
        total: values.total,
      },
    );
    // Data ou tipo mudaram: pós-venda e retorno pendentes são refeitos com a data certa.
    if (!sameDay || values.type !== service.type) {
      await tx
        .delete(tasks)
        .where(
          and(
            eq(tasks.serviceId, serviceId),
            eq(tasks.status, "pendente"),
            inArray(tasks.autoRule, ["R2", "R3"]),
          ),
        );
    }
    await syncAutoTasks(tx as unknown as Db, today, { customerId: service.customerId });
    return service.customerId;
  });
}

/**
 * Exclui um serviço registrado por engano. Os itens do estoque que ele baixou **voltam** ao
 * estoque (movimentação "ajuste" com o motivo), para o estoque continuar batendo com a prateleira.
 */
export async function deleteService(db: Db, serviceId: string, today = todayInStore()) {
  return db.transaction(async (tx) => {
    const [service] = await tx.select().from(services).where(eq(services.id, serviceId));
    if (!service) throw new CommandError("Serviço não encontrado.");
    const used = await tx
      .select({ productId: stockMovements.productId, quantity: stockMovements.quantity })
      .from(stockMovements)
      .where(
        and(eq(stockMovements.serviceId, serviceId), eq(stockMovements.kind, "saida_servico")),
      );
    for (const m of used) {
      const back = -m.quantity; // a saída foi gravada negativa
      await tx
        .update(products)
        .set({ quantity: sql`${products.quantity} + ${back}` })
        .where(eq(products.id, m.productId));
      await tx.insert(stockMovements).values({
        productId: m.productId,
        kind: "ajuste",
        quantity: back,
        note: "Devolução ao estoque: serviço excluído",
      });
    }
    await releaseAutoTasks(tx, { serviceId });
    await tx.delete(services).where(eq(services.id, serviceId));
    await audit(
      tx,
      "service",
      serviceId,
      "delete",
      { description: service.description, total: service.total, itensDevolvidos: used.length },
      null,
    );
    await syncAutoTasks(tx as unknown as Db, today, { customerId: service.customerId });
    return { customerId: service.customerId, returnedItems: used.length };
  });
}
