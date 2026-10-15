// Prompt da extração (D42), sem dependências: o workflow do n8n empacota este arquivo sozinho.
// Curto, em português, com regras e exemplos DIFERENTES das conversas de teste. As partes (tipos,
// regras, calendário) são reaproveitadas pela extração focada (focused.ts).
import { addDays } from "@/lib/dates";
import { findHints, formatHints } from "./hints";

export const EXTRACTION_PROMPT_VERSION = "extracao-v2";

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

export function weekdayOf(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

export const INTRO =
  "Você extrai dados de conversas de WhatsApp da loja de pneus Grupo Virtù (Campinas) para o sistema do dono da loja.";

/** O que cada tipo de evento significa (uma linha por tipo). */
export const TYPE_GUIDE: Record<string, string> = {
  "customer.upserted":
    'o PRÓPRIO CLIENTE informou o nome dele ("sou o...", "aqui é a..."), e-mail ou cidade. O nome que a loja usa para cumprimentar ("Ótimo, Ricardo!") NÃO conta: o sistema já conhece o cliente pelo telefone.',
  "vehicle.identified": "o cliente informou modelo, ano, placa ou medida do pneu.",
  "interaction.logged":
    "resumo curto do atendimento (dúvida, reclamação, pedido). Se o cliente perguntou ou pediu algo e nenhum outro tipo se aplica, gere este evento — mesmo para mensagens curtas ou vagas, com confiança baixa.",
  "quote.created":
    'a LOJA (Vito) passou um preço. "total" em reais como número (R$ 1.840,00 → 1840).',
  "quote.status_changed":
    'o cliente aceitou ("aprovado") ou recusou ("recusado") um orçamento de forma clara. "Vou ver", "te falo depois" ou "fechado, vou pensar" = ainda indeciso: NÃO gere este evento.',
  "appointment.requested":
    'a LOJA confirmou dia E horário de um serviço. "Passo aí na segunda" sem horário confirmado não é agendamento.',
  "task.suggested":
    'a loja precisa retornar ao cliente (ex.: "vou pedir para te ligarem"). "type": "pos_venda" = problema ou dúvida sobre serviço já feito; "followup_orcamento" = cobrar resposta de orçamento; "confirmar_agendamento"; "retorno_comercial" = oferecer serviço novo; "outro". "due_date" = quando a loja prometeu retornar ("hoje" → data de hoje).',
  "service.completed": "um serviço foi realizado na loja.",
};

/** Modelos pequenos erram conta de calendário: a lista pronta dos próximos dias evita isso. */
export function calendarLine(today: string): string {
  return Array.from({ length: 8 }, (_, i) => {
    const date = addDays(today, i);
    return `${weekdayOf(date)} ${date}${i === 0 ? " (hoje)" : i === 1 ? " (amanhã)" : ""}`;
  }).join("; ");
}

export function rulesText(today: string): string {
  return `Regras:
- Não invente: telefone, placa, valores e datas só se aparecerem na conversa.
- "evidence": copie LITERALMENTE o trecho da conversa (até 300 caracteres) que justifica o evento.
- "confidence": de 0 a 1, o quanto a conversa deixa o evento claro. Informação explícita → 0,9 ou mais; mensagem vaga → abaixo de 0,6.
- Calendário (fuso de Brasília, -03:00): ${calendarLine(today)}. Use estas datas para "hoje", "amanhã", "sábado" etc.
- Data e hora no formato 2026-10-17T09:00:00-03:00; data sem hora no formato AAAA-MM-DD.
- Valores de enum exatamente como no formato pedido (ex.: "alinhamento", "pos_venda", "whatsapp").
- "tire_size": só a medida, curta (ex.: "205/55 R16"); "plate": só a placa, sem espaços (ex.: "ABC1D23").`;
}

export function conversationText(messages: ConversationMessage[]): string {
  const lines = messages.map(
    (msg) => `[${msg.from === "cliente" ? "cliente" : "vito"}] ${msg.text}`,
  );
  return `Conversa:\n${lines.join("\n")}`;
}

/** Conversa + (opcional) dados encontrados por código no texto. */
export function userText(messages: ConversationMessage[], hints = false): string {
  const hintLine = hints ? formatHints(findHints(messages)) : "";
  return conversationText(messages) + (hintLine ? `\n\n${hintLine}` : "");
}

const EXAMPLES = `Exemplo 1 — conversa: [cliente] "Oi, sou o Bruno, quanto o balanceamento do Gol?" [vito] "Bruno, o balanceamento das 4 rodas sai R$ 120,00."
Saída: {"events":[{"type":"customer.upserted","confidence":0.9,"evidence":"sou o Bruno","data":{"name":"Bruno"}},{"type":"vehicle.identified","confidence":0.9,"evidence":"balanceamento do Gol","data":{"model":"Gol"}},{"type":"quote.created","confidence":0.9,"evidence":"o balanceamento das 4 rodas sai R$ 120,00","data":{"description":"Balanceamento das 4 rodas","total":120}}]}

Exemplo 2 — conversa: [cliente] "Achei caro, vou deixar pra depois."
Saída: {"events":[{"type":"quote.status_changed","confidence":0.75,"evidence":"Achei caro, vou deixar pra depois.","data":{"status":"recusado","reason":"Achou caro"}}]}

Exemplo 3 — conversa: [cliente] "faz rodízio?"
Saída: {"events":[{"type":"interaction.logged","confidence":0.4,"evidence":"faz rodízio?","data":{"summary":"Perguntou se a loja faz rodízio de pneus.","channel":"whatsapp"}}]}`;

/** Prompt "direto": todos os tipos de uma vez, saída {"events": [...]}. */
export function buildPrompt(input: {
  messages: ConversationMessage[];
  today: string;
  hints?: boolean;
}): { system: string; user: string } {
  const types = Object.entries(TYPE_GUIDE)
    .map(([type, guide]) => `- ${type}: ${guide}`)
    .join("\n");
  const system = `${INTRO}
Devolva SOMENTE JSON no formato pedido: {"events": [...]}. Uma conversa costuma gerar VÁRIOS eventos: gere um para cada tipo abaixo que a conversa sustentar. Se nada se aplicar, devolva {"events": []}.

Tipos de evento:
${types}

${rulesText(input.today)}

${EXAMPLES}`;
  return { system, user: userText(input.messages, input.hints) };
}
