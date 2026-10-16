"use server";

// Resposta do dono pelo Telegram (D57): sai pelo bot da oficina e fica registrada na conversa.
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { telegramChats, telegramMessages } from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import { telegramSender } from "@/lib/telegram/api";

const replySchema = z.object({
  customerId: z.uuid(),
  text: z.string().trim().min(1, "Escreva a mensagem").max(1000, "Máximo de 1.000 caracteres"),
});

export type ReplyState = { ok?: boolean; error?: string };

export async function replyTelegramAction(_prev: ReplyState, form: FormData): Promise<ReplyState> {
  await requireSession();
  const parsed = replySchema.safeParse({
    customerId: form.get("customerId"),
    text: form.get("text"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Mensagem inválida" };
  const token = process.env.TELEGRAM_CLIENTE_BOT_TOKEN;
  if (!token) return { error: "O bot do Telegram não está configurado." };

  const db = getDb();
  const [chat] = await db
    .select({ chatId: telegramChats.chatId })
    .from(telegramChats)
    .where(eq(telegramChats.customerId, parsed.data.customerId));
  if (!chat) return { error: "Este cliente ainda não conversou pelo Telegram." };

  try {
    await telegramSender(token)(chat.chatId, parsed.data.text);
  } catch {
    return { error: "Não foi possível enviar agora. Tente de novo em instantes." };
  }
  await db
    .insert(telegramMessages)
    .values({ chatId: chat.chatId, author: "gestor", text: parsed.data.text, extractedAt: null });
  revalidatePath(`/clientes/${parsed.data.customerId}`);
  return { ok: true };
}
