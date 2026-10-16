// Conversas do Telegram para as telas do dono (D57): a ficha de um cliente e a tela Conversas.
// Uma conversa pertence a um cliente pelo vínculo gravado OU pelo telefone compartilhado — assim,
// ao criar o cadastro com o mesmo telefone, a conversa aparece na hora.
import { desc, eq, inArray, or } from "drizzle-orm";
import type { Db } from "@/db";
import { customers, telegramChats, telegramMessages } from "@/db/schema";

export type ThreadMessage = {
  id: string;
  author: "cliente" | "vito" | "gestor";
  text: string;
  createdAt: Date;
};

export type TelegramThread = {
  chatId: string;
  firstName: string | null;
  phoneE164: string | null;
  customer: { id: string; name: string } | null;
  messages: ThreadMessage[];
  lastAt: Date | null;
  /** A última mensagem que não é do Vito é do cliente: o dono ainda não respondeu. */
  needsReply: boolean;
};

const needsReply = (messages: ThreadMessage[]) =>
  messages.filter((m) => m.author !== "vito").at(-1)?.author === "cliente";

async function messagesOf(db: Db, chatIds: string[], perChat: number) {
  if (!chatIds.length) return new Map<string, ThreadMessage[]>();
  const rows = await db
    .select({
      id: telegramMessages.id,
      chatId: telegramMessages.chatId,
      author: telegramMessages.author,
      text: telegramMessages.text,
      createdAt: telegramMessages.createdAt,
    })
    .from(telegramMessages)
    .where(inArray(telegramMessages.chatId, chatIds))
    .orderBy(desc(telegramMessages.createdAt));
  const byChat = new Map<string, ThreadMessage[]>();
  for (const { chatId, ...m } of rows) {
    const list = byChat.get(chatId) ?? [];
    if (list.length < perChat) list.push(m);
    byChat.set(chatId, list);
  }
  for (const list of byChat.values()) list.reverse();
  return byChat;
}

/** Conversa de um cliente (pelo vínculo ou pelo telefone), para a ficha. */
export async function telegramThread(
  db: Db,
  customer: { id: string; name: string; phoneE164: string | null },
  limit = 12,
): Promise<TelegramThread | null> {
  const [chat] = await db
    .select()
    .from(telegramChats)
    .where(
      customer.phoneE164
        ? or(
            eq(telegramChats.customerId, customer.id),
            eq(telegramChats.phoneE164, customer.phoneE164),
          )
        : eq(telegramChats.customerId, customer.id),
    )
    .limit(1);
  if (!chat) return null;
  const messages = (await messagesOf(db, [chat.chatId], limit)).get(chat.chatId) ?? [];
  return {
    chatId: chat.chatId,
    firstName: chat.firstName,
    phoneE164: chat.phoneE164,
    customer: { id: customer.id, name: customer.name },
    messages,
    lastAt: messages.at(-1)?.createdAt ?? null,
    needsReply: needsReply(messages),
  };
}

/** Todas as conversas (com ou sem cadastro), mais recentes primeiro — tela Conversas. */
export async function listConversations(db: Db, perChat = 8): Promise<TelegramThread[]> {
  const chats = await db.select().from(telegramChats);
  const phones = chats.map((c) => c.phoneE164).filter((p): p is string => !!p);
  const ids = chats.map((c) => c.customerId).filter((x): x is string => !!x);
  const people =
    phones.length || ids.length
      ? await db
          .select({ id: customers.id, name: customers.name, phoneE164: customers.phoneE164 })
          .from(customers)
          .where(
            or(
              ids.length ? inArray(customers.id, ids) : undefined,
              phones.length ? inArray(customers.phoneE164, phones) : undefined,
            ),
          )
      : [];
  const messages = await messagesOf(
    db,
    chats.map((c) => c.chatId),
    perChat,
  );
  return chats
    .map((chat) => {
      const customer =
        people.find((p) => p.id === chat.customerId) ??
        people.find((p) => !!chat.phoneE164 && p.phoneE164 === chat.phoneE164) ??
        null;
      const list = messages.get(chat.chatId) ?? [];
      return {
        chatId: chat.chatId,
        firstName: chat.firstName,
        phoneE164: chat.phoneE164,
        customer: customer && { id: customer.id, name: customer.name },
        messages: list,
        lastAt: list.at(-1)?.createdAt ?? null,
        needsReply: needsReply(list),
      };
    })
    .sort((a, b) => (b.lastAt?.getTime() ?? 0) - (a.lastAt?.getTime() ?? 0));
}

/** Quantas conversas esperam resposta do dono (menu e tela Hoje). */
export async function conversationsNeedingReply(db: Db): Promise<number> {
  return (await listConversations(db, 20)).filter((c) => c.needsReply).length;
}
