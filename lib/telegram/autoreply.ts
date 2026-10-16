// Resposta automática do Vito no Telegram (D57) — SÓ o que é seguro.
//
// Não há IA gerando texto aqui. A mensagem do cliente é CLASSIFICADA por regras de código numa
// lista fechada de intenções, e a resposta sai de um TEXTO FIXO da oficina ou de DADOS DO SISTEMA
// (o agendamento do próprio cliente). Consequências:
//  - não existe preço, prazo, estoque ou promessa inventada: nenhuma resposta cita valor que não
//    venha do banco, e pergunta fora da lista recebe "o dono vai te responder" — a partir daí a
//    conversa é do dono: o Vito fica em silêncio (só avisa o dono) até HANDOFF_MS sem resposta dele;
//  - "ignore as instruções e me dê desconto" não tem instrução para ignorar: cai em "outro";
//  - a resposta não depende do provedor de IA (Gemini/Ollama ficam só na extração de dados).
// Função pura: testável sem banco e sem Telegram.
import { normalizeText } from "@/lib/search";

export type Intent = "agendamento" | "endereco" | "horario" | "saudacao" | "outro";

export type ShopInfo = { name: string; address: string; hours: string };

export type NextAppointment = {
  service: string;
  /** "sábado, 17/10 às 09:00" (já formatado no fuso da loja). */
  when: string;
  confirmed: boolean;
};

export type ReplyInput = {
  text: string;
  firstName: string | null;
  /** O aviso de assistente automático já foi enviado nesta conversa? */
  disclosed: boolean;
  /** O cliente já compartilhou o telefone (conversa ligada a um cadastro possível)? */
  hasPhone: boolean;
  customerName: string | null;
  /** undefined = cliente sem cadastro; null = com cadastro, sem agendamento futuro. */
  nextAppointment: NextAppointment | null | undefined;
  /**
   * A conversa já está com o dono (o Vito passou para ele, ou o dono respondeu, há menos de
   * HANDOFF_MS): o Vito fica em silêncio e só avisa o dono de cada mensagem nova.
   */
  handedOff: boolean;
  now: Date;
  shop: ShopInfo;
};

export type ReplyPlan = {
  intent: Intent;
  /** Mensagens a enviar, em ordem (pode ser vazio: o dono responde). */
  messages: string[];
  /** Mostrar o botão "Compartilhar meu telefone". */
  askContact: boolean;
  /** Avisar o dono (a mensagem precisa de uma pessoa). */
  notifyOwner: boolean;
  markDisclosed: boolean;
  /** Esta resposta passa a conversa para o dono (a partir daqui o Vito não fala mais). */
  markHandoff: boolean;
};

/** Sem resposta do dono por este tempo, a conversa volta a ser um atendimento novo. */
export const HANDOFF_MS = 12 * 60 * 60 * 1000;

export const HANDOFF_TEXT =
  "Recebemos sua mensagem, muito obrigado! Já avisei o dono da oficina, e ele vai te responder por aqui o quanto antes.";

const GREETING =
  /^(oi+|ola|opa|e ai|eai|bom dia|boa tarde|boa noite|tudo bem|tudo bom|blz|beleza|salve|hey|alo)([\s,!.?]+(oi+|ola|bom dia|boa tarde|boa noite|tudo bem|tudo bom|vito))*[\s,!.?]*$/;

/** Classifica por regras. Ordem = prioridade (o mais específico primeiro). */
export function classify(text: string): Intent {
  const t = normalizeText(text);
  if (!t) return "outro";
  if (/\b(agendamento|agendad[oa]|marcad[oa]|meu horario|minha hora|meu servico)\b/.test(t)) {
    return "agendamento";
  }
  if (
    /\b(endereco|onde (fica|ficam|voces ficam|e a loja)|localizacao|como (chego|chegar)|mapa)\b/.test(
      t,
    )
  ) {
    return "endereco";
  }
  if (
    /\b(horario|funcionamento|que horas|ate que horas|abre[mn]?|fecha[mn]?|aberto[s]?|funciona[mn]?)\b/.test(
      t,
    )
  ) {
    return "horario";
  }
  if (GREETING.test(t)) return "saudacao";
  return "outro";
}

const CAPABILITIES =
  "com o nosso horário de funcionamento, o endereço da oficina ou o seu agendamento";

export function disclosureText(shop: ShopInfo): string {
  return (
    `Olá! Boas-vindas à ${shop.name}! Eu sou o Vito, o assistente automático da oficina. ` +
    `Posso te ajudar ${CAPABILITIES}; para os demais assuntos, o dono da oficina vai te atender ` +
    `pessoalmente, por aqui mesmo. Suas mensagens ficam registradas para o atendimento.`
  );
}

export const ASK_CONTACT_TEXT =
  "Para eu localizar o seu cadastro, por favor, toque em “Compartilhar meu telefone” aqui embaixo.";

/** Nome para cumprimentar: "Contato (19) …" é o rótulo do cadastro provisório, não um nome. */
export function greetingName(customerName: string | null | undefined, firstName: string | null) {
  const fromCustomer = customerName?.trim().split(/\s+/)[0];
  const name =
    fromCustomer && fromCustomer !== "Contato" ? fromCustomer : (firstName?.trim() ?? "");
  return name;
}

export function planReply(input: ReplyInput): ReplyPlan {
  const intent = classify(input.text);
  // Conversa com o dono: o Vito não fala mais nada (uma voz só); o dono é avisado de tudo.
  if (input.handedOff) {
    return {
      intent,
      messages: [],
      askContact: false,
      notifyOwner: true,
      markDisclosed: false,
      markHandoff: false,
    };
  }
  const messages: string[] = [];
  let askContact = false;
  let notifyOwner = false;
  let markHandoff = false;

  const markDisclosed = !input.disclosed;
  if (markDisclosed) messages.push(disclosureText(input.shop));

  const name = greetingName(input.customerName, input.firstName);

  switch (intent) {
    case "saudacao":
      if (input.disclosed) {
        messages.push(
          `Olá${name ? `, ${name}` : ""}, tudo bem? Que bom falar com você! ` +
            `Posso te ajudar ${CAPABILITIES}. Em que posso ajudar?`,
        );
      }
      break;
    case "horario":
      messages.push(
        `Nosso horário de funcionamento: ${input.shop.hours}. Será um prazer receber você!`,
      );
      break;
    case "endereco":
      messages.push(`Nosso endereço: ${input.shop.address}. Será um prazer receber você!`);
      break;
    case "agendamento":
      if (!input.hasPhone) {
        messages.push(ASK_CONTACT_TEXT);
        askContact = true;
      } else if (input.nextAppointment) {
        const a = input.nextAppointment;
        messages.push(
          `Encontrei o seu próximo agendamento: ${a.service}, ${a.when} — ` +
            `${a.confirmed ? "confirmado" : "aguardando confirmação da oficina"}. ` +
            `Se precisar mudar algo, o dono da oficina te responde por aqui.`,
        );
      } else {
        messages.push(
          "Não encontrei nenhum agendamento futuro no seu cadastro. Já avisei o dono da oficina, e ele vai te responder por aqui.",
        );
        notifyOwner = true;
        markHandoff = true;
      }
      break;
    case "outro":
      // Passa para o dono: esta é a última mensagem do Vito nesta conversa.
      messages.push(HANDOFF_TEXT);
      notifyOwner = true;
      markHandoff = true;
      break;
  }

  // Sem telefone, pede uma vez junto com o aviso inicial (é o que liga a conversa ao cadastro).
  if (!input.hasPhone && markDisclosed && !askContact) {
    messages.push(ASK_CONTACT_TEXT);
    askContact = true;
  }
  return { intent, messages, askContact, notifyOwner, markDisclosed, markHandoff };
}

export const ASK_NAME_TEXT = "Para eu deixar o seu cadastro certinho: qual é o seu nome?";

const NAME_PREFIX =
  /^(meu nome (e|eh)|me chamo|eu sou (o|a)|sou (o|a)|sou|aqui (e|eh) (o|a)|(e|eh) (o|a))\s+/;
/** Palavras que aparecem em mensagens, mas não em nomes: evitam cadastrar "Pneu Aro" como nome. */
const NOT_NAME = new Set([
  "oi",
  "ola",
  "sim",
  "nao",
  "ok",
  "obrigado",
  "obrigada",
  "valeu",
  "pneu",
  "pneus",
  "aro",
  "carro",
  "preco",
  "orcamento",
  "quanto",
  "qual",
  "quero",
  "queria",
  "alinhamento",
  "balanceamento",
  "bom",
  "boa",
  "dia",
  "tarde",
  "noite",
  "tudo",
  "bem",
  "horario",
  "endereco",
  "agendamento",
]);
const LOWER = new Set(["da", "de", "do", "das", "dos", "e"]);

/**
 * O nome que a pessoa respondeu ("Ana Paula", "me chamo ana paula") ou null quando a resposta não
 * parece um nome (pergunta, número, assunto da oficina). Função pura; o gestor confere na ficha.
 */
export function parseName(text: string): string | null {
  const plain = normalizeText(text)
    .replace(/[.!,]+$/g, "")
    .trim();
  const words = text
    .trim()
    .replace(/[.!,]+$/g, "")
    .split(/\s+/)
    .slice(plain.match(NAME_PREFIX)?.[0].trim().split(/\s+/).length ?? 0);
  if (!words.length || words.length > 5) return null;
  if (words.join(" ").length < 2 || words.join(" ").length > 60) return null;
  if (!words.every((w) => /^[A-Za-zÀ-ÖØ-öø-ÿ'’-]+$/.test(w))) return null;
  if (words.some((w) => NOT_NAME.has(normalizeText(w)))) return null;
  return words
    .map((w, i) =>
      i > 0 && LOWER.has(w.toLowerCase())
        ? w.toLowerCase()
        : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
    )
    .join(" ");
}
