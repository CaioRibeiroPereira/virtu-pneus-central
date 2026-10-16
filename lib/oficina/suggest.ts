// Sugestão de baixa de estoque para "serviço feito" vindo do Vito (D59). A IA NÃO mexe no estoque:
// o sistema sugere os itens a partir da conversa e do orçamento, e o gestor confirma na Revisão.
// Só sugere com certeza — medida citada, exatamente um pneu dessa medida e quantidade citada.
// Na dúvida, não chuta: explica e deixa o gestor escolher. Função pura.
import { findHints } from "@/lib/agent/hints";
import { normalizeText } from "@/lib/search";

export type StockProduct = {
  id: string;
  name: string;
  kind: "pneu" | "item";
  tireSize: string | null;
  quantity: number;
  active: boolean;
};

export type StockSuggestion = {
  items: { productId: string; quantity: number }[];
  /** Explicação para o gestor (o que foi sugerido ou por que não). */
  note: string | null;
};

const WORDS: Record<string, number> = {
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
};

/** "4 pneus", "quatro pneus", "2 pneus dianteiros" → quantidade. */
export function tireQuantity(texts: string[]): number | null {
  for (const text of texts) {
    const m = normalizeText(text).match(
      /\b(\d{1,2}|um|uma|dois|duas|tres|quatro|cinco|seis)\s+pneus?\b/,
    );
    if (m) return /^\d+$/.test(m[1]) ? Number(m[1]) : WORDS[m[1]];
  }
  return null;
}

const compact = (v: string) => normalizeText(v).replace(/[^a-z0-9]/g, "");

export function suggestStockItems(
  products: StockProduct[],
  input: { texts: string[]; quote?: { tireSize: string | null; quantity: number | null } | null },
): StockSuggestion {
  const texts = input.texts.filter(Boolean);
  const fromQuote = input.quote?.tireSize ? [input.quote.tireSize] : [];
  const sizes = findHints(
    [...texts, ...fromQuote].map((text) => ({ from: "cliente", text })),
  ).tireSizes;
  if (!sizes.length) return { items: [], note: null };

  const size = sizes[0];
  const matches = products.filter(
    (p) => p.active && p.kind === "pneu" && p.tireSize && compact(p.tireSize) === compact(size),
  );
  if (matches.length === 0) {
    return { items: [], note: `Nenhum pneu ${size} cadastrado no estoque.` };
  }
  if (matches.length > 1) {
    return {
      items: [],
      note: `Há ${matches.length} pneus ${size} no estoque (${matches.map((m) => m.name).join(", ")}): escolha qual saiu.`,
    };
  }
  // A conversa do serviço feito vale mais que o orçamento (orçou 4, trocou 2).
  const quantity = tireQuantity(texts) ?? input.quote?.quantity ?? null;
  const [p] = matches;
  if (!quantity) {
    return {
      items: [],
      note: `Pneu ${p.name} ${size} encontrado no estoque; informe a quantidade que saiu.`,
    };
  }
  return {
    items: [{ productId: p.id, quantity }],
    note: `Sugestão pela conversa: ${quantity} × ${p.name} ${size} (há ${p.quantity}). Confira antes de aprovar.`,
  };
}
