// Estoque (D58): produtos, entradas, ajustes e baixa automática ao registrar um serviço.
// Toda mudança de quantidade gera uma movimentação (histórico) e auditoria, na mesma transação.
// A baixa é atômica: "UPDATE … SET quantidade = quantidade - n WHERE quantidade >= n" — com dois
// registros ao mesmo tempo, o estoque nunca fica negativo (o banco ainda tem CHECK quantidade >= 0).
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { auditLog, customers, products, services, stockMovements } from "@/db/schema";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export class StockError extends Error {}

async function audit(
  tx: Tx,
  entityId: string,
  action: "create" | "update",
  after: unknown,
  before?: unknown,
) {
  await tx.insert(auditLog).values({
    entityType: "product",
    entityId,
    action,
    actorType: "gestor",
    before: before ?? null,
    after,
  });
}

export type ProductInput = {
  kind: "pneu" | "item";
  name: string;
  tireSize?: string;
  price: number;
  minQuantity: number;
};

export async function createProduct(db: Db, input: ProductInput & { quantity: number }) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(products)
      .values({
        kind: input.kind,
        name: input.name,
        tireSize: input.tireSize ?? null,
        price: input.price,
        minQuantity: input.minQuantity,
        quantity: input.quantity,
      })
      .returning({ id: products.id });
    if (input.quantity > 0) {
      await tx.insert(stockMovements).values({
        productId: row.id,
        kind: "entrada",
        quantity: input.quantity,
        note: "Estoque inicial",
      });
    }
    await audit(tx, row.id, "create", input);
    return row.id;
  });
}

export async function updateProduct(db: Db, id: string, input: ProductInput & { active: boolean }) {
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(products).where(eq(products.id, id));
    if (!before) throw new StockError("Produto não encontrado.");
    // A quantidade NÃO muda aqui: só por entrada, ajuste ou baixa (sempre com histórico).
    await tx
      .update(products)
      .set({
        kind: input.kind,
        name: input.name,
        tireSize: input.tireSize ?? null,
        price: input.price,
        minQuantity: input.minQuantity,
        active: input.active,
      })
      .where(eq(products.id, id));
    await audit(tx, id, "update", input, {
      name: before.name,
      price: before.price,
      minQuantity: before.minQuantity,
      active: before.active,
    });
  });
}

/** Chegada de mercadoria. */
export async function addStockEntry(db: Db, productId: string, quantity: number, note?: string) {
  if (!Number.isInteger(quantity) || quantity <= 0) throw new StockError("Quantidade inválida.");
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(products)
      .set({ quantity: sql`${products.quantity} + ${quantity}` })
      .where(eq(products.id, productId))
      .returning({ quantity: products.quantity });
    if (!row) throw new StockError("Produto não encontrado.");
    await tx
      .insert(stockMovements)
      .values({ productId, kind: "entrada", quantity, note: note || null });
    await audit(tx, productId, "update", { entrada: quantity, quantidade: row.quantity, note });
    return row.quantity;
  });
}

/** Contagem física: corrige a quantidade para o número contado (fica registrado como ajuste). */
export async function adjustStock(db: Db, productId: string, counted: number, note: string) {
  if (!Number.isInteger(counted) || counted < 0) throw new StockError("Quantidade inválida.");
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select({ quantity: products.quantity })
      .from(products)
      .where(eq(products.id, productId))
      .for("update");
    if (!before) throw new StockError("Produto não encontrado.");
    const diff = counted - before.quantity;
    if (diff === 0) return counted;
    await tx.update(products).set({ quantity: counted }).where(eq(products.id, productId));
    await tx.insert(stockMovements).values({ productId, kind: "ajuste", quantity: diff, note });
    await audit(
      tx,
      productId,
      "update",
      { quantidade: counted, note },
      { quantidade: before.quantity },
    );
    return counted;
  });
}

export type ServiceItem = { productId: string; quantity: number };

/**
 * Baixa dos itens usados num serviço — chamada DENTRO da transação que grava o serviço: se faltar
 * estoque de qualquer item, lança StockError e nada é gravado (nem o serviço).
 */
export async function consumeForService(tx: Tx, serviceId: string, items: ServiceItem[]) {
  // Mesmo produto em duas linhas do formulário: soma.
  const merged = new Map<string, number>();
  for (const i of items) merged.set(i.productId, (merged.get(i.productId) ?? 0) + i.quantity);
  for (const [productId, quantity] of merged) {
    if (!Number.isInteger(quantity) || quantity <= 0) throw new StockError("Quantidade inválida.");
    const [row] = await tx
      .update(products)
      .set({ quantity: sql`${products.quantity} - ${quantity}` })
      .where(and(eq(products.id, productId), gte(products.quantity, quantity)))
      .returning({ id: products.id });
    if (!row) {
      const [p] = await tx
        .select({ name: products.name, quantity: products.quantity })
        .from(products)
        .where(eq(products.id, productId));
      throw new StockError(
        p
          ? `Estoque insuficiente: ${p.name} (há ${p.quantity}, o serviço usa ${quantity}). Registre a entrada antes.`
          : "Produto do estoque não encontrado.",
      );
    }
    await tx.insert(stockMovements).values({
      productId,
      kind: "saida_servico",
      quantity: -quantity,
      serviceId,
    });
  }
}

// ---------- consultas ----------

export async function listProducts(db: Db, opts: { lowOnly?: boolean } = {}) {
  const rows = await db
    .select()
    .from(products)
    .where(
      opts.lowOnly
        ? and(eq(products.active, true), lte(products.quantity, products.minQuantity))
        : undefined,
    )
    .orderBy(desc(products.active), products.name);
  return rows.map((p) => ({ ...p, low: p.active && p.quantity <= p.minQuantity }));
}

export async function lowStock(db: Db) {
  return listProducts(db, { lowOnly: true });
}

export async function productDetail(db: Db, id: string) {
  const [product] = await db.select().from(products).where(eq(products.id, id));
  if (!product) return null;
  const movements = await db
    .select({
      id: stockMovements.id,
      kind: stockMovements.kind,
      quantity: stockMovements.quantity,
      note: stockMovements.note,
      createdAt: stockMovements.createdAt,
      customerId: services.customerId,
      customerName: customers.name,
    })
    .from(stockMovements)
    .leftJoin(services, eq(services.id, stockMovements.serviceId))
    .leftJoin(customers, eq(customers.id, services.customerId))
    .where(eq(stockMovements.productId, id))
    .orderBy(desc(stockMovements.createdAt))
    .limit(40);
  return {
    product: { ...product, low: product.active && product.quantity <= product.minQuantity },
    movements,
  };
}
