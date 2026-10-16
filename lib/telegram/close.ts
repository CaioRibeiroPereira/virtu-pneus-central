// Encerrar a conversa do Telegram (D62): o atendente fecha o atendimento. O bot manda a despedida,
// a conversa sai de "aguardando você" (a última mensagem passa a ser da loja) e o Vito volta a
// responder sozinho o que é seguro na próxima mensagem do cliente — um atendimento novo.
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { telegramChats, telegramMessages } from "@/db/schema";
import type { SendMessage } from "./api";

export const CLOSING_TEXT =
  "Foi um prazer atender você! Vamos encerrar este atendimento por aqui. Muito obrigado pelo contato e, quando precisar, é só mandar uma mensagem.";

export type CloseResult = { ok: true } | { ok: false; reason: "not_found" };

export async function closeConversation(
  db: Db,
  chatId: string,
  send: SendMessage,
): Promise<CloseResult> {
  const [chat] = await db
    .select({ chatId: telegramChats.chatId })
    .from(telegramChats)
    .where(eq(telegramChats.chatId, chatId));
  if (!chat) return { ok: false, reason: "not_found" };
  // Se o Telegram recusar o envio, nada é gravado (quem chama mostra o erro).
  await send(chat.chatId, CLOSING_TEXT);
  await db.insert(telegramMessages).values({
    chatId: chat.chatId,
    author: "gestor",
    text: CLOSING_TEXT,
    intent: "encerramento",
  });
  await db.update(telegramChats).set({ handedOffAt: null }).where(eq(telegramChats.chatId, chatId));
  return { ok: true };
}
