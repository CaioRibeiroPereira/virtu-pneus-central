// Conversas do Telegram prontas para a extração do Vito (D57): o n8n busca, manda para o MESMO
// workflow de extração do WhatsApp e depois confirma. Só entram conversas com telefone (é ele que
// liga os eventos ao cliente) e paradas há IDLE_MS (não extrair no meio da conversa).
import { and, asc, eq, inArray, isNotNull, isNull, lte, max, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { telegramChats, telegramMessages } from "@/db/schema";

export const IDLE_MS = 2 * 60 * 1000;
export const MAX_BATCH = 50;
const CONTACT_MARK = "[compartilhou o telefone]";

export type ReadyConversation = {
  chat_id: string;
  phone: string;
  /** Estável para o mesmo lote: reprocessar gera os mesmos event_id ("duplicate"). */
  conversation_id: string;
  message_ids: string[];
  messages: { from: "cliente" | "vito"; text: string }[];
  /** Instante da última mensagem do lote: o n8n devolve ao confirmar. */
  ate: string;
};

export async function readyConversations(db: Db, now = new Date()): Promise<ReadyConversation[]> {
  // Chats com mensagens do cliente ainda não extraídas e sem mensagem nova há IDLE_MS.
  const pending = await db
    .select({ chatId: telegramMessages.chatId, last: max(telegramMessages.createdAt) })
    .from(telegramMessages)
    .innerJoin(telegramChats, eq(telegramChats.chatId, telegramMessages.chatId))
    .where(isNotNull(telegramChats.phoneE164))
    .groupBy(telegramMessages.chatId)
    .having(
      and(
        sql`bool_or(${telegramMessages.author} = 'cliente' and ${telegramMessages.extractedAt} is null and ${telegramMessages.text} <> ${CONTACT_MARK})`,
        lte(max(telegramMessages.createdAt), new Date(now.getTime() - IDLE_MS)),
      ),
    );
  if (!pending.length) return [];

  const chats = await db
    .select()
    .from(telegramChats)
    .where(
      inArray(
        telegramChats.chatId,
        pending.map((p) => p.chatId),
      ),
    );
  const result: ReadyConversation[] = [];
  for (const chat of chats) {
    const all = await db
      .select()
      .from(telegramMessages)
      .where(eq(telegramMessages.chatId, chat.chatId))
      .orderBy(asc(telegramMessages.createdAt));
    // O lote começa na primeira mensagem do cliente ainda não extraída (respostas no meio entram
    // como contexto, do lado da loja).
    const start = all.findIndex(
      (m) => m.author === "cliente" && !m.extractedAt && m.text !== CONTACT_MARK,
    );
    if (start < 0) continue;
    // O contrato aceita até 50 message_ids por evento (§8.1): conversa longa vai pelas últimas 50.
    const batch = all
      .slice(start)
      .filter((m) => m.text !== CONTACT_MARK)
      .slice(-MAX_BATCH);
    if (!batch.length) continue;
    result.push({
      chat_id: chat.chatId,
      phone: chat.phoneE164!,
      conversation_id: `tg-${chat.chatId}-${batch[0].id.slice(0, 8)}`,
      message_ids: batch.map((m) => m.id),
      messages: batch.map((m) => ({
        from: m.author === "cliente" ? "cliente" : "vito",
        text: m.text,
      })),
      ate: batch[batch.length - 1].createdAt.toISOString(),
    });
  }
  return result;
}

/** Marca como extraídas as mensagens do cliente até `ate` (confirmação do n8n). */
export async function markExtracted(db: Db, chatId: string, ate: Date, now = new Date()) {
  const rows = await db
    .update(telegramMessages)
    .set({ extractedAt: now })
    .where(
      and(
        eq(telegramMessages.chatId, chatId),
        eq(telegramMessages.author, "cliente"),
        isNull(telegramMessages.extractedAt),
        lte(telegramMessages.createdAt, ate),
      ),
    )
    .returning({ id: telegramMessages.id });
  return rows.length;
}
