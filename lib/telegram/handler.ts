// Recebe um update do Telegram (D57): grava a mensagem, liga a conversa ao cadastro pelo telefone
// compartilhado e responde SÓ o que é seguro (lib/telegram/autoreply.ts). Dependências injetadas
// (banco, envio, aviso ao dono) para os testes rodarem sem Telegram.
import { and, asc, eq, gte, inArray } from "drizzle-orm";
import type { Db } from "@/db";
import { appointments, auditLog, customers, telegramChats, telegramMessages } from "@/db/schema";
import { serviceTypeLabel } from "@/lib/labels";
import { normalizePhone } from "@/lib/phone";
import type { SendMessage, TelegramUpdate } from "./api";
import {
  ASK_NAME_TEXT,
  greetingName,
  HANDOFF_MS,
  parseName,
  planReply,
  type NextAppointment,
  type ShopInfo,
} from "./autoreply";

export type TelegramDeps = {
  db: Db;
  send: SendMessage;
  /** Avisa o dono (bot do resumo). Opcional: sem ele, a conversa só aparece no sistema. */
  notifyOwner?: (text: string) => Promise<void>;
  shop: ShopInfo;
  appUrl: string;
  now?: Date;
};

export type TelegramOutcome =
  | { status: "ignored" }
  | { status: "duplicate" }
  | { status: "ok"; intent?: string; customerId: string | null };

const STORE_TZ = "America/Sao_Paulo";

/** "sábado, 17/10 às 09:00" no fuso da loja. */
function describeWhen(instant: Date): string {
  const weekday = new Intl.DateTimeFormat("pt-BR", { timeZone: STORE_TZ, weekday: "long" }).format(
    instant,
  );
  const day = new Intl.DateTimeFormat("pt-BR", {
    timeZone: STORE_TZ,
    day: "2-digit",
    month: "2-digit",
  }).format(instant);
  const time = new Intl.DateTimeFormat("pt-BR", {
    timeZone: STORE_TZ,
    hour: "2-digit",
    minute: "2-digit",
  }).format(instant);
  return `${weekday}, ${day} às ${time}`;
}

async function nextAppointmentOf(
  db: Db,
  customerId: string,
  now: Date,
): Promise<NextAppointment | null> {
  const [a] = await db
    .select({
      serviceType: appointments.serviceType,
      scheduledAt: appointments.scheduledAt,
      status: appointments.status,
    })
    .from(appointments)
    .where(
      and(
        eq(appointments.customerId, customerId),
        gte(appointments.scheduledAt, now),
        inArray(appointments.status, ["agendado", "confirmado"]),
      ),
    )
    .orderBy(asc(appointments.scheduledAt))
    .limit(1);
  if (!a) return null;
  return {
    service: serviceTypeLabel[a.serviceType] ?? "Serviço",
    when: describeWhen(a.scheduledAt),
    confirmed: a.status === "confirmado",
  };
}

async function sendAll(
  deps: TelegramDeps,
  chatId: string,
  messages: string[],
  opts: { askContact?: boolean; removeKeyboard?: boolean; intent?: string } = {},
) {
  for (const [i, text] of messages.entries()) {
    const last = i === messages.length - 1;
    try {
      await deps.send(chatId, text, {
        askContact: last && opts.askContact,
        removeKeyboard: last && opts.removeKeyboard,
      });
      await deps.db
        .insert(telegramMessages)
        .values({ chatId, author: "vito", text, intent: opts.intent ?? null });
    } catch (error) {
      // Falha de envio não derruba o recebimento: a mensagem do cliente já está gravada.
      console.error("telegram: falha ao enviar", { chatId, error: String(error) });
    }
  }
}

export async function handleTelegramUpdate(
  update: TelegramUpdate,
  deps: TelegramDeps,
): Promise<TelegramOutcome> {
  const msg = update.message;
  // Só conversas privadas com pessoas (grupos e outros bots ficam de fora).
  if (!msg || msg.chat.type !== "private" || msg.from?.is_bot) return { status: "ignored" };
  if (!msg.text && !msg.contact) return { status: "ignored" };

  const { db } = deps;
  const now = deps.now ?? new Date();
  const chatId = String(msg.chat.id);
  const firstName = msg.from?.first_name ?? null;

  await db.insert(telegramChats).values({ chatId, firstName }).onConflictDoNothing();

  // Idempotência: o Telegram reenvia o mesmo update quando a resposta demora.
  const [stored] = await db
    .insert(telegramMessages)
    .values({
      chatId,
      author: "cliente",
      text: msg.contact ? "[compartilhou o telefone]" : (msg.text ?? ""),
      updateId: String(update.update_id),
    })
    .onConflictDoNothing({ target: telegramMessages.updateId })
    .returning({ id: telegramMessages.id });
  if (!stored) return { status: "duplicate" };

  let [chat] = await db.select().from(telegramChats).where(eq(telegramChats.chatId, chatId));

  // ---------- telefone compartilhado ----------
  if (msg.contact) {
    // Só o PRÓPRIO telefone liga a conversa ao cadastro (contato encaminhado de outra pessoa, não).
    const own = msg.contact.user_id !== undefined && msg.contact.user_id === msg.from?.id;
    const phone = own ? normalizePhone(msg.contact.phone_number) : null;
    if (!phone) {
      await sendAll(
        deps,
        chatId,
        ["Por favor, use o botão “Compartilhar meu telefone” para enviar o seu próprio número."],
        {
          askContact: true,
        },
      );
      return { status: "ok", customerId: chat.customerId };
    }
    const [customer] = await db
      .select({ id: customers.id, name: customers.name })
      .from(customers)
      .where(eq(customers.phoneE164, phone.e164));
    [chat] = await db
      .update(telegramChats)
      // Sem cadastro: o Vito pergunta o nome (a próxima resposta vira o cadastro — D65).
      .set({
        phoneE164: phone.e164,
        customerId: customer?.id ?? null,
        nameAskedAt: customer ? null : now,
      })
      .where(eq(telegramChats.chatId, chatId))
      .returning();
    await sendAll(
      deps,
      chatId,
      customer && greetingName(customer.name, null)
        ? [
            `Obrigado, ${greetingName(customer.name, null)}! Encontrei o seu cadastro. Em que posso ajudar?`,
          ]
        : customer
          ? ["Obrigado! Encontrei o seu cadastro. Em que posso ajudar?"]
          : ["Obrigado! Anotei o seu telefone.", ASK_NAME_TEXT],
      { removeKeyboard: true },
    );
    await deps
      .notifyOwner?.(
        customer
          ? `📱 ${customer.name} (Telegram) compartilhou o telefone. Ficha: ${deps.appUrl}/clientes/${customer.id}`
          : `📱 ${firstName ?? "Um cliente"} (Telegram) compartilhou o telefone ${phone.display}; ainda sem cadastro.`,
      )
      .catch(() => {});
    return { status: "ok", customerId: customer?.id ?? null };
  }

  // ---------- mensagem de texto ----------
  // Cliente cadastrado depois do telefone (ex.: criado pela extração): liga agora.
  if (chat.phoneE164 && !chat.customerId) {
    const [customer] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.phoneE164, chat.phoneE164));
    if (customer) {
      [chat] = await db
        .update(telegramChats)
        .set({ customerId: customer.id })
        .where(eq(telegramChats.chatId, chatId))
        .returning();
    }
  }
  // ---------- resposta ao "qual é o seu nome?" ----------
  // Parece um nome: vira o cadastro (provisório, como os criados pelo Vito: o gestor confere).
  const informedName =
    chat.phoneE164 && !chat.customerId && chat.nameAskedAt ? parseName(msg.text ?? "") : null;
  if (informedName && chat.phoneE164) {
    const phone = normalizePhone(chat.phoneE164)!;
    const [created] = await db
      .insert(customers)
      .values({
        name: informedName,
        phoneE164: phone.e164,
        phoneDisplay: phone.display,
        isProvisional: true,
        source: "agente",
        notes: "Cadastrado pelo Vito no Telegram, com o nome informado pelo cliente.",
      })
      .onConflictDoNothing({ target: customers.phoneE164 })
      .returning({ id: customers.id });
    const customerId =
      created?.id ??
      (
        await db
          .select({ id: customers.id })
          .from(customers)
          .where(eq(customers.phoneE164, phone.e164))
      )[0]?.id;
    if (created) {
      await db.insert(auditLog).values({
        entityType: "customer",
        entityId: created.id,
        action: "create",
        actorType: "agente",
        after: { name: informedName, provisional: true, origem: "Telegram" },
      });
    }
    await db
      .update(telegramChats)
      .set({ customerId: customerId ?? null, nameAskedAt: null })
      .where(eq(telegramChats.chatId, chatId));
    await sendAll(deps, chatId, [
      `Prazer, ${informedName.split(" ")[0]}! Já anotei no seu cadastro. Em que posso ajudar?`,
    ]);
    await deps
      .notifyOwner?.(
        `🆕 ${informedName} (Telegram) se apresentou ao Vito. Ficha: ${deps.appUrl}/clientes/${customerId}`,
      )
      .catch(() => {});
    return { status: "ok", intent: "nome", customerId: customerId ?? null };
  }

  const [customer] = chat.customerId
    ? await db
        .select({ name: customers.name })
        .from(customers)
        .where(eq(customers.id, chat.customerId))
    : [];

  const plan = planReply({
    text: msg.text ?? "",
    firstName,
    disclosed: !!chat.disclosedAt,
    hasPhone: !!chat.phoneE164,
    customerName: customer?.name ?? null,
    nextAppointment: chat.customerId
      ? await nextAppointmentOf(db, chat.customerId, now)
      : undefined,
    handedOff: !!chat.handedOffAt && now.getTime() - chat.handedOffAt.getTime() < HANDOFF_MS,
    now,
    shop: deps.shop,
  });

  // Telefone conhecido, sem cadastro e o nome nunca perguntado (ex.: conversa anterior à D65 ou
  // demonstração reiniciada): pergunta junto com a resposta, se o Vito ainda estiver falando.
  const askName =
    !!chat.phoneE164 && !chat.customerId && !chat.nameAskedAt && plan.messages.length > 0;
  const messages = askName ? [...plan.messages, ASK_NAME_TEXT] : plan.messages;
  await sendAll(deps, chatId, messages, { askContact: plan.askContact, intent: plan.intent });
  if (plan.markDisclosed || plan.markHandoff || askName) {
    await db
      .update(telegramChats)
      .set({
        ...(plan.markDisclosed ? { disclosedAt: now } : {}),
        ...(plan.markHandoff ? { handedOffAt: now } : {}),
        ...(askName ? { nameAskedAt: now } : {}),
      })
      .where(eq(telegramChats.chatId, chatId));
  }
  if (plan.notifyOwner) {
    const who = customer?.name ?? firstName ?? "Cliente";
    const where = chat.customerId
      ? `Responder: ${deps.appUrl}/clientes/${chat.customerId}`
      : "Ainda sem cadastro (aguardando o telefone).";
    await deps
      .notifyOwner?.(`📩 ${who} (Telegram): “${(msg.text ?? "").slice(0, 300)}”\n${where}`)
      .catch(() => {});
  }
  return { status: "ok", intent: plan.intent, customerId: chat.customerId };
}
