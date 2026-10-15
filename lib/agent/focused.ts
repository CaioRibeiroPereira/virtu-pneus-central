// Extração FOCADA (D52), pensada para modelos pequenos locais: em vez de pedir os 8 tipos de evento
// de uma vez (um formato grande, com 8 alternativas), faz:
//   1. CLASSIFICAÇÃO: quais tipos a conversa contém? (saída curta: {"types": [...]})
//   2. EXTRAÇÃO POR TIPO: um pedido curto por tipo, com o formato só daquele tipo e um exemplo próprio.
// O resultado vira o mesmo {"events": [...]} da extração direta e passa pelo mesmo pós-processamento.
// Sem dependências: roda no n8n. Exemplos diferentes das conversas de teste.
import { addDays } from "@/lib/dates";
import { INTRO, TYPE_GUIDE, rulesText, userText, type ConversationMessage } from "./prompt";
import { EVENT_TYPES, type EventType } from "./refine";

export const FOCUSED_VERSION = "focada-v1";

/** JSON Schema da classificação. */
export const CLASSIFY_SCHEMA = {
  type: "object",
  properties: {
    types: { type: "array", items: { type: "string", enum: [...EVENT_TYPES] } },
  },
  required: ["types"],
};

export function buildClassifyPrompt(input: {
  messages: ConversationMessage[];
  today: string;
  hints?: boolean;
}): { system: string; user: string } {
  const types = EVENT_TYPES.map((t) => `- ${t}: ${TYPE_GUIDE[t]}`).join("\n");
  const system = `${INTRO}
Sua tarefa agora é só CLASSIFICAR: diga quais tipos de evento abaixo a conversa contém. Devolva SOMENTE {"types": [...]}. Uma conversa pode ter vários tipos ou nenhum.

Tipos de evento:
${types}

Exemplos:
- [cliente] "Oi, sou o Bruno, quanto o balanceamento do Gol?" [vito] "Bruno, o balanceamento das 4 rodas sai R$ 120,00." → {"types":["customer.upserted","vehicle.identified","quote.created"]}
- [cliente] "Achei caro, vou deixar pra depois." → {"types":["quote.status_changed"]}
- [cliente] "faz rodízio?" → {"types":["interaction.logged"]}
- [cliente] "Valeu, até mais!" → {"types":[]}`;
  return { system, user: userText(input.messages, input.hints) };
}

/** Lê a classificação; tipos desconhecidos são ignorados. */
export function parseTypes(text: string): EventType[] {
  try {
    const types = (JSON.parse(text) as { types?: unknown }).types;
    if (!Array.isArray(types)) return [];
    return [...new Set(types)].filter((t): t is EventType => EVENT_TYPES.includes(t as EventType));
  } catch {
    return [];
  }
}

/** Próxima data (depois de hoje) cujo dia da semana é `weekday` (0 = domingo). */
function nextDate(today: string, weekday: number): string {
  for (let i = 1; i <= 7; i++) {
    const date = addDays(today, i);
    const [y, m, d] = date.split("-").map(Number);
    if (new Date(Date.UTC(y, m - 1, d)).getUTCDay() === weekday) return date;
  }
  return addDays(today, 1);
}

/** Um exemplo por tipo, com a saída no formato do pedido focado. */
function exampleFor(type: EventType, today: string): string {
  const friday = nextDate(today, 5);
  const monday = nextDate(today, 1);
  const ex: Record<EventType, [string, object]> = {
    "customer.upserted": [
      '[cliente] "Aqui é o Marcos, de Sumaré. Queria ver um pneu."',
      { name: "Marcos", city: "Sumaré" },
    ],
    "vehicle.identified": [
      '[cliente] "É um Fiat Argo 2020, placa QWE2R34, usa pneu 185/65 R15."',
      { model: "Fiat Argo", year: 2020, plate: "QWE2R34", tire_size: "185/65 R15" },
    ],
    "interaction.logged": [
      '[cliente] "Vocês abrem no domingo?"',
      { summary: "Perguntou se a loja abre no domingo.", channel: "whatsapp" },
    ],
    "quote.created": [
      '[vito] "O alinhamento com cambagem fica R$ 150,00."',
      { description: "Alinhamento com cambagem", total: 150 },
    ],
    "quote.status_changed": [
      '[cliente] "Pode seguir com o orçamento, tá aprovado."',
      { status: "aprovado" },
    ],
    "appointment.requested": [
      '[cliente] "Dá pra trocar os pneus sexta às 16h?" [vito] "Sexta às 16h, confirmado."',
      { scheduled_at: `${friday}T16:00:00-03:00`, service_type: "troca_pneus" },
    ],
    "task.suggested": [
      '[vito] "Te chamo na segunda que vem pra lembrar da revisão dos pneus."',
      {
        type: "retorno_comercial",
        title: "Lembrar da revisão dos pneus",
        reason: "Loja combinou de avisar o cliente",
        due_date: monday,
      },
    ],
    "service.completed": [
      '[vito] "Alinhamento feito, seu Pedro! Ficou R$ 120,00."',
      {
        type: "alinhamento",
        description: "Alinhamento",
        performed_at: `${today}T12:00:00-03:00`,
        total: 120,
      },
    ],
  };
  const [talk, data] = ex[type];
  const evidence = talk.match(/"([^"]+)"/)?.[1] ?? "";
  return `Exemplo — conversa: ${talk}
Saída: ${JSON.stringify({ type, confidence: 0.9, evidence, data })}`;
}

export function buildTypePrompt(input: {
  messages: ConversationMessage[];
  today: string;
  type: EventType;
  hints?: boolean;
}): { system: string; user: string } {
  const system = `${INTRO}
Extraia SOMENTE o evento "${input.type}": ${TYPE_GUIDE[input.type]}
Devolva SOMENTE um objeto JSON no formato pedido, com "type": "${input.type}". Se, olhando de perto, a conversa NÃO tiver este evento, devolva "confidence": 0.
Em service.completed sem horário citado, use 12:00 de hoje em "performed_at".

${rulesText(input.today)}

${exampleFor(input.type, input.today)}`;
  return { system, user: userText(input.messages, input.hints) };
}

/** Junta as respostas por tipo no formato {"events": [...]} da extração direta. */
export function mergeTypeOutputs(outputs: { type: EventType; text: string }[]): {
  events: unknown[];
} {
  const events = outputs.flatMap(({ type, text }) => {
    try {
      const item = JSON.parse(text) as { confidence?: unknown };
      // confiança ~0 = o próprio modelo concluiu que o evento não está na conversa
      if (typeof item.confidence === "number" && item.confidence < 0.2) return [];
      return [{ ...item, type }];
    } catch {
      return [];
    }
  });
  return { events };
}
