// Sugestões de baixa de estoque para os "serviços feitos" pendentes na Revisão (D59).
import { desc, inArray } from "drizzle-orm";
import type { Db } from "@/db";
import { quotes } from "@/db/schema";
import { listProducts } from "@/lib/oficina/inventory";
import { suggestStockItems, type StockSuggestion } from "@/lib/oficina/suggest";
import type { ReviewCard } from "./queries";

export type StockOptions = {
  /** Produtos ativos para os campos "Itens do estoque usados". */
  products: { id: string; label: string }[];
  byReview: Record<string, StockSuggestion>;
};

export async function stockSuggestions(db: Db, cards: ReviewCard[]): Promise<StockOptions> {
  const services = cards.filter((c) => c.event.type === "service.completed");
  if (!services.length) return { products: [], byReview: {} };

  const products = (await listProducts(db)).filter((p) => p.active);
  const customerIds = [
    ...new Set(services.map((c) => c.customer?.id).filter((x): x is string => !!x)),
  ];
  // Orçamento do cliente (aprovado de preferência): medida e quantidade do que foi vendido.
  const quoteRows = customerIds.length
    ? await db
        .select({
          customerId: quotes.customerId,
          status: quotes.status,
          tireSize: quotes.tireSize,
          quantity: quotes.quantity,
        })
        .from(quotes)
        .where(inArray(quotes.customerId, customerIds))
        .orderBy(desc(quotes.createdAt))
    : [];

  const byReview: Record<string, StockSuggestion> = {};
  for (const card of services) {
    const mine = quoteRows.filter((q) => q.customerId === card.customer?.id);
    const quote = mine.find((q) => q.status === "aprovado") ?? mine[0] ?? null;
    byReview[card.id] = suggestStockItems(products, {
      texts: [String(card.data.description ?? ""), card.event.evidence ?? ""],
      quote,
    });
  }
  return {
    products: products.map((p) => ({
      id: p.id,
      label: `${p.name}${p.tireSize ? ` ${p.tireSize}` : ""} — ${p.quantity} em estoque`,
    })),
    byReview,
  };
}
