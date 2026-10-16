// Conversa do Telegram de um cliente, para a ficha (D57).
import { desc, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { telegramChats, telegramMessages } from "@/db/schema";

export type TelegramThread = {
  chatId: string;
  firstName: string | null;
  messages: { id: string; author: "cliente" | "vito" | "gestor"; text: string; createdAt: Date }[];
};

export async function telegramThread(
  db: Db,
  customerId: string,
  limit = 12,
): Promise<TelegramThread | null> {
  const [chat] = await db
    .select()
    .from(telegramChats)
    .where(eq(telegramChats.customerId, customerId));
  if (!chat) return null;
  const rows = await db
    .select({
      id: telegramMessages.id,
      author: telegramMessages.author,
      text: telegramMessages.text,
      createdAt: telegramMessages.createdAt,
    })
    .from(telegramMessages)
    .where(eq(telegramMessages.chatId, chat.chatId))
    .orderBy(desc(telegramMessages.createdAt))
    .limit(limit);
  return { chatId: chat.chatId, firstName: chat.firstName, messages: rows.reverse() };
}
