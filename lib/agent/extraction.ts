// Extração de eventos a partir de uma conversa de WhatsApp (D42) — o mesmo para Gemini e Ollama:
//  1. o FORMATO pedido à IA sai do contrato zod (§8.2): uma única fonte de verdade;
//  2. o PROMPT (prompt.ts) é curto, em português, com regras e exemplos fora do conjunto de teste;
//  3. o PÓS-PROCESSAMENTO valida cada item com zod e passa pelo núcleo de refine.ts (lastro,
//     confiança recalculada, envelope §8.1). O endpoint ainda valida tudo de novo.
import { z } from "zod";
import { agentEventSchema, eventDataSchemas, type AgentEvent } from "./schema";
import { type ConversationMessage } from "./prompt";
import {
  parseExtraction,
  refineItems,
  type Adjustment,
  type EventType,
  type ExtractedItem,
  type PostProcessMeta,
  type Rejection,
} from "./refine";

export { buildPrompt, EXTRACTION_PROMPT_VERSION, type ConversationMessage } from "./prompt";
export type { Adjustment, PostProcessMeta } from "./refine";

const EVENT_TYPES = Object.keys(eventDataSchemas) as EventType[];

// A IA não conhece ids internos: quote_id sai do formato pedido (o sistema resolve o orçamento).
const llmData: Record<EventType, z.ZodObject> = {
  ...eventDataSchemas,
  "quote.status_changed": eventDataSchemas["quote.status_changed"].omit({ quote_id: true }),
};

const llmItem = (type: EventType) =>
  z.object({
    type: z.literal(type),
    confidence: z.number().min(0).max(1),
    evidence: z.string().max(300),
    data: llmData[type],
  });

export const extractionSchema = z.object({
  events: z.array(z.union(EVENT_TYPES.map(llmItem) as unknown as [z.ZodObject, z.ZodObject])),
});

/** JSON Schema enviado ao Gemini (responseJsonSchema) e ao Ollama (format). */
export function extractionJsonSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(extractionSchema) as Record<string, unknown>;
  delete schema.$schema;
  return simplifyForLlm(schema) as Record<string, unknown>;
}

/** JSON Schema de UM evento (extração focada, D52): o mesmo contrato, só o tipo pedido. */
export function itemJsonSchema(type: EventType): Record<string, unknown> {
  const schema = z.toJSONSchema(llmItem(type)) as Record<string, unknown>;
  delete schema.$schema;
  return simplifyForLlm(schema) as Record<string, unknown>;
}

/**
 * Remove "pattern" e "format" (ex.: a regex de e-mail): atrapalham a gramática que o Ollama usa
 * para forçar o formato e não ajudam o modelo. A validação completa acontece depois (postProcess
 * e o próprio endpoint).
 */
function simplifyForLlm(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(simplifyForLlm);
  if (node && typeof node === "object") {
    return Object.fromEntries(
      Object.entries(node)
        .filter(([key]) => key !== "pattern" && key !== "format")
        .map(([key, value]) => [key, simplifyForLlm(value)]),
    );
  }
  return node;
}

const zodIssues = (error: z.ZodError) =>
  error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);

/** Valida a saída da IA com o contrato zod e aplica o refinamento de refine.ts (D48). */
export function postProcess(
  raw: unknown,
  conversation: ConversationMessage[],
  meta: PostProcessMeta,
): {
  events: AgentEvent[];
  rejected: Rejection[];
  adjustments: Adjustment[];
  error?: string;
} {
  const parsed = parseExtraction(raw);
  if ("error" in parsed) return { events: [], rejected: [], adjustments: [], error: parsed.error };

  // Valida EVENTO POR EVENTO: um item malformado (comum em modelos pequenos) é rejeitado sozinho,
  // sem derrubar os outros que vieram certos.
  const rejected: Rejection[] = [];
  const items: { index: number; item: ExtractedItem }[] = [];
  parsed.events.forEach((rawItem, index) => {
    const type = (rawItem as { type?: unknown })?.type;
    if (typeof type !== "string" || !(type in llmData)) {
      rejected.push({ index, issues: [`tipo desconhecido: ${String(type)}`] });
      return;
    }
    const one = llmItem(type as EventType).safeParse(rawItem);
    if (one.success) items.push({ index, item: one.data as ExtractedItem });
    else rejected.push({ index, issues: zodIssues(one.error) });
  });

  const refined = refineItems(items, conversation, meta);
  rejected.push(...refined.rejected);
  const events: AgentEvent[] = [];
  for (const { index, event } of refined.candidates) {
    const full = agentEventSchema.safeParse(event);
    if (full.success) events.push(full.data);
    else rejected.push({ index, issues: zodIssues(full.error) });
  }
  return { events, rejected, adjustments: refined.adjustments };
}
