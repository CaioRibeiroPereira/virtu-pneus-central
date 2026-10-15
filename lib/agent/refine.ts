// Núcleo do pós-processamento da extração (D48), SEM zod: roda no banco de testes (via postProcess,
// que valida com zod antes e depois) e no n8n, cujo sandbox desativa Object.defineProperty — de que
// o zod depende (D50). No n8n a validação completa fica com o endpoint, que recebe um evento por vez.
import { normalizeText } from "@/lib/search";
import { EXTRACTION_PROMPT_VERSION, type ConversationMessage } from "./prompt";

/** Tipos de evento do contrato (§8.2). Um teste garante que batem com lib/agent/schema.ts. */
export const EVENT_TYPES = [
  "customer.upserted",
  "vehicle.identified",
  "interaction.logged",
  "quote.created",
  "task.suggested",
  "appointment.requested",
  "quote.status_changed",
  "service.completed",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export type ExtractedItem = {
  type: EventType;
  confidence: number;
  evidence: string;
  data: Record<string, unknown>;
};

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
  /** Campos descartados por não aparecerem na conversa (ex.: cidade copiada do prompt). */
  removed?: string[];
};

export type Rejection = { index: number; issues: string[] };

/** Valores em reais citados na conversa ("R$ 1.840,00", "1840", "1.840"). */
function moneyMentions(text: string): Set<number> {
  const values = new Set<number>();
  for (const match of text.matchAll(/\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?/g)) {
    const n = Number(match[0].replace(/\./g, "").replace(",", "."));
    if (Number.isFinite(n)) values.add(n);
  }
  return values;
}

// ---------- lastro: valores que a IA só pode trazer se estiverem na conversa ----------
const compact = (v: string) => normalizeText(v).replace(/[^a-z0-9@.]/g, "");
const words = (v: string) => normalizeText(v).match(/[a-z0-9]{3,}/g) ?? [];

type Grounding = "exato" | "palavra";
/** Campos copiáveis da conversa. Textos livres (descrição, resumo, motivo) ficam de fora. */
const GROUNDED: Partial<Record<EventType, Record<string, Grounding>>> = {
  "customer.upserted": { name: "palavra", email: "exato", city: "palavra" },
  "vehicle.identified": { plate: "exato", model: "palavra", tire_size: "exato", year: "exato" },
  "quote.created": { tire_size: "exato", vehicle_plate: "exato" },
};
/** Sem estes campos o evento não diz nada (ex.: só "origin"). */
const NEEDS_ONE_OF: Partial<Record<EventType, string[]>> = {
  "customer.upserted": ["name", "email", "city"],
  "vehicle.identified": ["plate", "model", "tire_size", "year"],
};

const WEEKDAY_WORDS = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];
const STORE_TZ = "America/Sao_Paulo";

/** Horas citadas na conversa: "9h", "9:30", "às 14 horas", "meio-dia". */
function hourMentions(normalized: string): Set<number> {
  const hours = new Set<number>();
  for (const m of normalized.matchAll(/\b(\d{1,2})\s*(?:h\b|h\d{2}|:\d{2}|horas?\b)/g)) {
    hours.add(Number(m[1]));
  }
  if (normalized.includes("meio-dia") || normalized.includes("meio dia")) hours.add(12);
  return hours;
}

function storeParts(instant: string): { hour: number; weekday: number } {
  const date = new Date(instant);
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: STORE_TZ, hour: "2-digit", hourCycle: "h23" })
      .format(date)
      .slice(0, 2),
  );
  const name = new Intl.DateTimeFormat("en-US", { timeZone: STORE_TZ, weekday: "short" }).format(
    date,
  );
  return { hour, weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(name) };
}

/**
 * Exige lastro, recalcula a confiança e monta o envelope (§8.1) de cada item já validado:
 *  - placa, medida, e-mail, ano, nome, cidade e modelo só ficam se aparecerem na conversa
 *    (senão o campo é descartado; evento que fica vazio é rejeitado);
 *  - trecho de evidência que não está na conversa → no máximo 0,5 (possível invenção);
 *  - valor de orçamento que não aparece na conversa → no máximo 0,5;
 *  - agendamento sem a hora ou com dia da semana diferente do citado → no máximo 0,5;
 *  - agendamento no passado → no máximo 0,4.
 */
export function refineItems(
  items: { index: number; item: ExtractedItem }[],
  conversation: ConversationMessage[],
  meta: PostProcessMeta,
): {
  candidates: { index: number; event: Record<string, unknown> }[];
  rejected: Rejection[];
  adjustments: Adjustment[];
} {
  const rejected: Rejection[] = [];
  const adjustments: Adjustment[] = [];
  const fullText = conversation.map((m) => m.text).join("\n");
  const normalizedText = normalizeText(fullText).replace(/[“”"]/g, "");
  const compactText = compact(fullText);
  const textWords = new Set(words(fullText));
  const mentions = moneyMentions(fullText);
  const hours = hourMentions(normalizedText);
  const weekdays = WEEKDAY_WORDS.flatMap((w, i) => (normalizedText.includes(w) ? [i] : []));

  // 1) Lastro: descarta valores que não estão na conversa.
  const removedByIndex = new Map<number, string[]>();
  const grounded = items.flatMap(({ item, index }) => {
    const rules = GROUNDED[item.type] ?? {};
    const data: Record<string, unknown> = { ...item.data };
    const removed: string[] = [];
    for (const [field, mode] of Object.entries(rules)) {
      const value = data[field];
      if (value === undefined) continue;
      const ok =
        mode === "exato"
          ? !!compact(String(value)) && compactText.includes(compact(String(value)))
          : words(String(value)).some((w) => textWords.has(w));
      if (!ok) {
        delete data[field];
        removed.push(field);
      }
    }
    const needs = NEEDS_ONE_OF[item.type];
    if (needs && !needs.some((field) => data[field] !== undefined)) {
      rejected.push({ index, issues: [`nada da conversa sustenta: ${removed.join(", ") || "-"}`] });
      return [];
    }
    if (removed.length) removedByIndex.set(index, removed);
    return [{ index, item: { ...item, data } }];
  });
  const customerName = grounded.find(({ item }) => item.type === "customer.upserted")?.item.data
    .name as string | undefined;

  // 2) Confiança recalculada com checagens objetivas; 3) envelope montado por código.
  const candidates = grounded.map(({ item, index }) => {
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
    if (item.type === "appointment.requested") {
      const { hour, weekday } = storeParts(String(item.data.scheduled_at));
      if (!hours.has(hour)) {
        confidence = Math.min(confidence, 0.5);
        reasons.push("horário não aparece na conversa");
      }
      if (weekdays.length && !weekdays.includes(weekday)) {
        confidence = Math.min(confidence, 0.5);
        reasons.push("dia da semana diferente do citado");
      }
    }
    const removed = removedByIndex.get(index);
    if (confidence !== item.confidence || removed) {
      adjustments.push({
        index,
        type: item.type,
        from: item.confidence,
        to: confidence,
        reasons,
        ...(removed ? { removed } : {}),
      });
    }

    const event = {
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
    return { index, event };
  });

  return { candidates, rejected, adjustments };
}

/** Lê o JSON da IA e confere só o formato mínimo: `{"events": [...]}`. */
export function parseExtraction(raw: unknown): { events: unknown[] } | { error: string } {
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return { error: "a IA não devolveu JSON válido" };
    }
  }
  const events = (value as { events?: unknown } | null)?.events;
  if (!Array.isArray(events)) return { error: 'esperado {"events": [...]}' };
  return { events };
}

/**
 * Versão do n8n: checagem mínima por item (tipo conhecido, confiança, evidência e `data`) e o
 * mesmo refinamento. Os eventos saem SEM a validação zod completa — o endpoint faz essa validação
 * (422 por evento), então o resultado final é o mesmo do postProcess.
 */
export function postProcessLite(
  raw: unknown,
  conversation: ConversationMessage[],
  meta: PostProcessMeta,
): {
  events: Record<string, unknown>[];
  rejected: Rejection[];
  adjustments: Adjustment[];
  error?: string;
} {
  const parsed = parseExtraction(raw);
  if ("error" in parsed) return { events: [], rejected: [], adjustments: [], error: parsed.error };
  const rejected: Rejection[] = [];
  const items: { index: number; item: ExtractedItem }[] = [];
  parsed.events.forEach((rawItem, index) => {
    const it = rawItem as Partial<ExtractedItem> | null;
    const ok =
      !!it &&
      EVENT_TYPES.includes(it.type as EventType) &&
      typeof it.confidence === "number" &&
      it.confidence >= 0 &&
      it.confidence <= 1 &&
      typeof it.evidence === "string" &&
      !!it.data &&
      typeof it.data === "object" &&
      !Array.isArray(it.data);
    if (ok) items.push({ index, item: it as ExtractedItem });
    else rejected.push({ index, issues: ["item fora do formato pedido"] });
  });
  const refined = refineItems(items, conversation, meta);
  return {
    events: refined.candidates.map((c) => c.event),
    rejected: [...rejected, ...refined.rejected],
    adjustments: refined.adjustments,
  };
}
