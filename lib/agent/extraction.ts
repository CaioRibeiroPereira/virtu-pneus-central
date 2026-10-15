// Extração de eventos a partir de uma conversa de WhatsApp (D42) — o mesmo para Gemini e Ollama:
//  1. o FORMATO pedido à IA sai do contrato zod (§8.2): uma única fonte de verdade;
//  2. o PROMPT é curto, em português, com regras e exemplos (diferentes das conversas de teste);
//  3. o PÓS-PROCESSAMENTO monta o envelope (§8.1) por código e RECALCULA a confiança com checagens
//     objetivas — modelos pequenos avaliam mal a própria certeza. O endpoint ainda valida tudo de novo.
import { z } from "zod";
import { agentEventSchema, eventDataSchemas, type AgentEvent } from "./schema";
import { normalizeText } from "@/lib/search";

export const EXTRACTION_PROMPT_VERSION = "extracao-v1";

type EventType = keyof typeof eventDataSchemas;
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
export type ExtractionOutput = {
  events: {
    type: EventType;
    confidence: number;
    evidence: string;
    data: Record<string, unknown>;
  }[];
};

/** JSON Schema enviado ao Gemini (responseJsonSchema) e ao Ollama (format). */
export function extractionJsonSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(extractionSchema) as Record<string, unknown>;
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

export type ConversationMessage = { from: "cliente" | "vito" | "loja" | string; text: string };

const WEEKDAYS = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];

export function buildPrompt(input: { messages: ConversationMessage[]; today: string }): {
  system: string;
  user: string;
} {
  const [y, m, d] = input.today.split("-").map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const system = `Você extrai dados de conversas de WhatsApp da loja de pneus Grupo Virtù (Campinas) para o sistema do dono da loja.
Devolva SOMENTE JSON no formato pedido: {"events": [...]}. Extraia apenas o que a conversa sustenta; se nada se aplicar, devolva {"events": []}.

Tipos de evento:
- customer.upserted: o cliente informou nome, e-mail ou cidade.
- vehicle.identified: o cliente informou modelo, ano, placa ou medida do pneu.
- interaction.logged: resumo curto do atendimento (dúvida, reclamação, pedido) quando não couber em outro tipo.
- quote.created: a LOJA (Vito) passou um preço. "total" em reais como número (R$ 1.840,00 → 1840).
- quote.status_changed: o cliente aceitou ("aprovado") ou recusou ("recusado") um orçamento.
- appointment.requested: ficou combinado dia e horário de um serviço.
- task.suggested: a loja precisa retornar ao cliente (ex.: "vou pedir para te ligarem").
- service.completed: um serviço foi realizado na loja.

Regras:
- Não invente: telefone, placa, valores e datas só se aparecerem na conversa.
- "evidence": copie LITERALMENTE o trecho da conversa (até 300 caracteres) que justifica o evento.
- "confidence": de 0 a 1, o quanto a conversa deixa o evento claro. Mensagem vaga → abaixo de 0,6.
- Hoje é ${weekday}, ${input.today}. Fuso de Brasília (-03:00). Converta "amanhã", "sábado" etc. em datas reais.
- Data e hora no formato 2026-10-17T09:00:00-03:00; data sem hora no formato AAAA-MM-DD.
- Valores de enum exatamente como no formato pedido (ex.: "alinhamento", "pos_venda", "whatsapp").

Exemplo 1 — conversa: [cliente] "Oi, sou o Bruno, quanto o balanceamento do Gol?" [vito] "Bruno, o balanceamento das 4 rodas sai R$ 120,00."
Saída: {"events":[{"type":"customer.upserted","confidence":0.9,"evidence":"sou o Bruno","data":{"name":"Bruno"}},{"type":"vehicle.identified","confidence":0.8,"evidence":"balanceamento do Gol","data":{"model":"Gol"}},{"type":"quote.created","confidence":0.9,"evidence":"o balanceamento das 4 rodas sai R$ 120,00","data":{"description":"Balanceamento das 4 rodas","total":120}}]}

Exemplo 2 — conversa: [cliente] "Achei caro, vou deixar pra depois."
Saída: {"events":[{"type":"quote.status_changed","confidence":0.75,"evidence":"Achei caro, vou deixar pra depois.","data":{"status":"recusado","reason":"Achou caro"}}]}`;
  const lines = input.messages.map(
    (msg) => `[${msg.from === "cliente" ? "cliente" : "vito"}] ${msg.text}`,
  );
  return { system, user: `Conversa:\n${lines.join("\n")}` };
}

/** Valores em reais citados na conversa ("R$ 1.840,00", "1840", "1.840"). */
function moneyMentions(text: string): Set<number> {
  const values = new Set<number>();
  for (const match of text.matchAll(/\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?/g)) {
    const n = Number(match[0].replace(/\./g, "").replace(",", "."));
    if (Number.isFinite(n)) values.add(n);
  }
  return values;
}

export type PostProcessMeta = {
  phone: string;
  conversationId: string;
  messageIds: string[];
  occurredAt: string;
  model: string;
};

export type Adjustment = {
  index: number;
  type: string;
  from: number;
  to: number;
  reasons: string[];
};

/**
 * Valida a saída da IA, monta os eventos completos e recalcula a confiança:
 *  - trecho de evidência que não está na conversa → no máximo 0,5 (possível invenção);
 *  - valor de orçamento que não aparece na conversa → no máximo 0,5;
 *  - agendamento no passado → no máximo 0,4.
 */
export function postProcess(
  raw: unknown,
  conversation: ConversationMessage[],
  meta: PostProcessMeta,
): {
  events: AgentEvent[];
  rejected: { index: number; issues: string[] }[];
  adjustments: Adjustment[];
  error?: string;
} {
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return { events: [], rejected: [], adjustments: [], error: "a IA não devolveu JSON válido" };
    }
  }
  // Valida EVENTO POR EVENTO: um item malformado (comum em modelos pequenos) é rejeitado sozinho,
  // sem derrubar os outros que vieram certos.
  const outer = z.object({ events: z.array(z.unknown()) }).safeParse(value);
  if (!outer.success) {
    return { events: [], rejected: [], adjustments: [], error: 'esperado {"events": [...]}' };
  }
  const events: AgentEvent[] = [];
  const rejected: { index: number; issues: string[] }[] = [];
  const adjustments: Adjustment[] = [];
  const items: { index: number; item: ExtractionOutput["events"][number] }[] = [];
  outer.data.events.forEach((rawItem, index) => {
    const type = (rawItem as { type?: unknown })?.type;
    if (typeof type !== "string" || !(type in llmData)) {
      rejected.push({ index, issues: [`tipo desconhecido: ${String(type)}`] });
      return;
    }
    const one = llmItem(type as EventType).safeParse(rawItem);
    if (one.success) items.push({ index, item: one.data as ExtractionOutput["events"][number] });
    else
      rejected.push({
        index,
        issues: one.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      });
  });

  const fullText = conversation.map((m) => m.text).join("\n");
  const normalizedText = normalizeText(fullText).replace(/[“”"]/g, "");
  const mentions = moneyMentions(fullText);
  const customerName = items.find(({ item }) => item.type === "customer.upserted")?.item.data
    .name as string | undefined;

  items.forEach(({ item, index }) => {
    const reasons: string[] = [];
    let confidence = item.confidence;
    const evidence = item.evidence.trim();
    if (evidence && !normalizedText.includes(normalizeText(evidence).replace(/[“”"]/g, ""))) {
      confidence = Math.min(confidence, 0.5);
      reasons.push("evidência não encontrada na conversa");
    }
    if (item.type === "quote.created" && !mentions.has(Number(item.data.total))) {
      confidence = Math.min(confidence, 0.5);
      reasons.push("valor não aparece na conversa");
    }
    if (
      item.type === "appointment.requested" &&
      Date.parse(String(item.data.scheduled_at)) < Date.parse(meta.occurredAt)
    ) {
      confidence = Math.min(confidence, 0.4);
      reasons.push("agendamento no passado");
    }
    if (confidence !== item.confidence) {
      adjustments.push({ index, type: item.type, from: item.confidence, to: confidence, reasons });
    }

    const candidate = {
      schema_version: "1.0",
      event_id: `${meta.conversationId}-${index + 1}-${item.type}`,
      type: item.type,
      occurred_at: meta.occurredAt,
      source: {
        channel: "whatsapp",
        conversation_id: meta.conversationId,
        message_ids: meta.messageIds,
      },
      agent: {
        name: "vito-extrator",
        model: meta.model,
        prompt_version: EXTRACTION_PROMPT_VERSION,
      },
      confidence: Math.round(confidence * 100) / 100,
      ...(evidence ? { evidence: evidence.slice(0, 500) } : {}),
      // O telefone vem do metadado do WhatsApp, nunca do texto da conversa.
      customer: { phone: meta.phone, ...(customerName ? { name: customerName } : {}) },
      data: item.data,
    };
    const full = agentEventSchema.safeParse(candidate);
    if (full.success) events.push(full.data);
    else
      rejected.push({
        index,
        issues: full.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      });
  });

  return { events, rejected, adjustments };
}
