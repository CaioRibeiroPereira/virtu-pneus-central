import { getDb } from "@/db";
import { publicAppUrl } from "@/lib/app-url";
import { constantTimeEqual } from "@/lib/auth/token";
import { shopInfo } from "@/lib/shop";
import { telegramSender, type TelegramUpdate } from "@/lib/telegram/api";
import { handleTelegramUpdate } from "@/lib/telegram/handler";

// Webhook do bot da oficina (D57). O Telegram manda o segredo combinado no setWebhook em todo
// pedido (X-Telegram-Bot-Api-Secret-Token): sem ele, ninguém consegue se passar pelo Telegram.
export const dynamic = "force-dynamic";

const MAX_BYTES = 64 * 1024;

export async function POST(request: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const token = process.env.TELEGRAM_CLIENTE_BOT_TOKEN;
  if (!secret || !token)
    return Response.json({ error: "telegram_not_configured" }, { status: 503 });

  const received = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!constantTimeEqual(received, secret)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const raw = await request.text();
  if (raw.length > MAX_BYTES) return Response.json({ error: "payload_too_large" }, { status: 413 });

  let update: TelegramUpdate;
  try {
    update = JSON.parse(raw) as TelegramUpdate;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const ownerToken = process.env.TELEGRAM_BOT_TOKEN;
  const ownerChat = process.env.TELEGRAM_CHAT_ID;
  const notify = ownerToken && ownerChat ? telegramSender(ownerToken) : null;

  try {
    const outcome = await handleTelegramUpdate(update, {
      db: getDb(),
      send: telegramSender(token),
      notifyOwner: notify ? (text) => notify(ownerChat!, text) : undefined,
      shop: shopInfo(),
      appUrl: publicAppUrl(),
    });
    return Response.json(outcome);
  } catch (error) {
    // 500 faz o Telegram reenviar depois; é seguro porque a gravação é idempotente (update_id único)
    // e evita perder a mensagem do cliente quando o banco falha por um instante.
    console.error("telegram webhook falhou", { update_id: update.update_id, error: String(error) });
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
