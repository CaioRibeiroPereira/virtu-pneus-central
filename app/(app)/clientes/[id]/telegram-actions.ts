"use server";

// Resposta do dono pelo Telegram (D57): sai pelo bot da oficina e fica registrada na conversa.
// Funciona pela conversa (chat), com ou sem cadastro do cliente.
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { telegramChats, telegramMessages } from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import { telegramSender } from "@/lib/telegram/api";

const replySchema = z.object({
  chatId: z.string().regex(/^\d{1,20}$/, "Conversa inválida"),
  text: z.string().trim().min(1, "Escreva a mensagem").max(1000, "Máximo de 1.000 caracteres"),
});

export type ReplyState = { ok?: boolean; error?: string };

export async function replyTelegramAction(_prev: ReplyState, form: FormData): Promise<ReplyState> {
  await requireSession();
  const parsed = replySchema.safeParse({ chatId: form.get("chatId"), text: form.get("text") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Mensagem inválida" };
  const token = process.env.TELEGRAM_CLIENTE_BOT_TOKEN;
  if (!token) return { error: "O bot do Telegram não está configurado." };

  const db = getDb();
  const [chat] = await db
    .select({ chatId: telegramChats.chatId })
    .from(telegramChats)
    .where(eq(telegramChats.chatId, parsed.data.chatId));
  if (!chat) return { error: "Conversa não encontrada." };

  try {
    await telegramSender(token)(chat.chatId, parsed.data.text);
  } catch {
    return { error: "Não foi possível enviar agora. Tente de novo em instantes." };
  }
  await db
    .insert(telegramMessages)
    .values({ chatId: chat.chatId, author: "gestor", text: parsed.data.text });
  // O dono assumiu a conversa: o Vito fica em silêncio por 12 h a partir daqui (D57).
  await db
    .update(telegramChats)
    .set({ handedOffAt: new Date() })
    .where(eq(telegramChats.chatId, chat.chatId));
  revalidatePath("/conversas");
  revalidatePath("/clientes/[id]", "page");
  return { ok: true };
}
