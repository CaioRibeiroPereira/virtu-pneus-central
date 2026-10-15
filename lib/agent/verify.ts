// Verificação dos eventos extraídos (D52), pensada para modelos pequenos locais: eles "inventam"
// eventos com confiança alta, mas acertam bem mais respondendo sim/não do que gerando. Para cada
// evento, uma pergunta curta: "a conversa sustenta este evento com estes dados?". Reprovado não é
// apagado: cai para confiança 0,5 e vai para a Revisão do gestor. Sem dependências: roda no n8n.
import { INTRO, TYPE_GUIDE, conversationText, type ConversationMessage } from "./prompt";

export const VERIFY_SCHEMA = {
  type: "object",
  properties: { sustentado: { type: "boolean" }, motivo: { type: "string" } },
  required: ["sustentado", "motivo"],
};

export const VERIFY_FAILED_CONFIDENCE = 0.5;

type RawEvent = { type?: unknown; confidence?: unknown; evidence?: unknown; data?: unknown };

export function buildVerifyPrompt(input: { messages: ConversationMessage[]; event: RawEvent }): {
  system: string;
  user: string;
} {
  const type = String(input.event.type);
  const system = `${INTRO}
Sua tarefa é CONFERIR um evento que outro sistema extraiu da conversa. Seja rigoroso.
Responda SOMENTE {"sustentado": true ou false, "motivo": "frase curta"}.
"sustentado": true só se a conversa mostra CLARAMENTE este tipo de evento E cada valor em "data" está dito na conversa (ou é consequência direta dela, como "amanhã" virar a data de amanhã).
Se o tipo não corresponder ao que aconteceu na conversa ou algum valor não estiver nela: false.`;
  const user = `${conversationText(input.messages)}

Evento extraído — tipo "${type}" (${TYPE_GUIDE[type] ?? "tipo desconhecido"})
Dados: ${JSON.stringify(input.event.data)}
Trecho citado: ${JSON.stringify(input.event.evidence ?? "")}`;
  return { system, user };
}

/** Lê o veredito; resposta ilegível conta como reprovação (na dúvida, o gestor vê). */
export function parseVerdict(text: string): { sustained: boolean; reason: string } {
  try {
    const v = JSON.parse(text) as { sustentado?: unknown; motivo?: unknown };
    return { sustained: v.sustentado === true, reason: String(v.motivo ?? "") };
  } catch {
    return { sustained: false, reason: "veredito ilegível" };
  }
}

/** Rebaixa a confiança dos eventos reprovados (os demais ficam como vieram). */
export function applyVerdicts(events: RawEvent[], verdicts: { sustained: boolean }[]): RawEvent[] {
  return events.map((event, i) =>
    verdicts[i]?.sustained || typeof event.confidence !== "number"
      ? event
      : { ...event, confidence: Math.min(event.confidence, VERIFY_FAILED_CONFIDENCE) },
  );
}
