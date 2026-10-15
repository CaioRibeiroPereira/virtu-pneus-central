// Dados objetivos encontrados no texto por código (placas, medidas, valores, horários).
// Modelos pequenos erram justamente esses campos; entregá-los prontos como dica ajuda, e o lastro
// do pós-processamento (refine.ts) continua conferindo tudo. Sem dependências: roda no n8n.
import { normalizeText } from "@/lib/search";
import type { ConversationMessage } from "./prompt";

/** Horas citadas na conversa (texto já normalizado): "9h", "9:30", "às 14 horas", "meio-dia". */
export function hourMentions(normalized: string): Set<number> {
  const hours = new Set<number>();
  for (const m of normalized.matchAll(/\b(\d{1,2})\s*(?:h\b|h\d{2}|:\d{2}|horas?\b)/g)) {
    const h = Number(m[1]);
    if (h <= 23) hours.add(h);
  }
  if (normalized.includes("meio-dia") || normalized.includes("meio dia")) hours.add(12);
  return hours;
}

export type TextHints = {
  plates: string[];
  tireSizes: string[];
  amounts: number[];
  hours: number[];
};

const unique = <T>(items: T[]) => [...new Set(items)];

export function findHints(messages: ConversationMessage[]): TextHints {
  const text = messages.map((m) => m.text).join("\n");
  // Placa antiga (ABC-1234) ou Mercosul (ABC1D23).
  const plates = [...text.matchAll(/\b([A-Za-z]{3})[-\s]?(\d[A-Za-z0-9]\d{2})\b/g)].map((m) =>
    (m[1] + m[2]).toUpperCase(),
  );
  // Medida de pneu: 205/55 R16, 205/55R16, 205 / 55 ZR 16.
  const tireSizes = [...text.matchAll(/\b(\d{3})\s*\/\s*(\d{2})\s*Z?R\s*(\d{2})\b/gi)].map(
    (m) => `${m[1]}/${m[2]} R${m[3]}`,
  );
  // Valores em reais com "R$" na frente: "R$ 1.840,00" → 1840.
  const amounts = [...text.matchAll(/R\$\s*(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?)/g)]
    .map((m) => Number(m[1].replace(/\./g, "").replace(",", ".")))
    .filter((n) => Number.isFinite(n));
  const hours = [...hourMentions(normalizeText(text))].sort((a, b) => a - b);
  return {
    plates: unique(plates),
    tireSizes: unique(tireSizes),
    amounts: unique(amounts),
    hours,
  };
}

/** Linha para o pedido à IA; vazia quando nada foi encontrado. */
export function formatHints(hints: TextHints): string {
  const parts = [
    hints.plates.length && `placas: ${hints.plates.join(", ")}`,
    hints.tireSizes.length && `medidas de pneu: ${hints.tireSizes.join(", ")}`,
    hints.amounts.length && `valores em R$: ${hints.amounts.join(", ")}`,
    hints.hours.length && `horários citados: ${hints.hours.map((h) => `${h}h`).join(", ")}`,
  ].filter(Boolean);
  return parts.length
    ? `Dados encontrados no texto pelo sistema (use só se a conversa confirmar): ${parts.join("; ")}.`
    : "";
}
