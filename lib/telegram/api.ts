// Chamadas à Bot API do Telegram (D57). O token nunca sai do servidor.

export type SendOptions = { askContact?: boolean; removeKeyboard?: boolean };
export type SendMessage = (chatId: string, text: string, opts?: SendOptions) => Promise<void>;

/** Envia uma mensagem; com askContact mostra o botão "Compartilhar meu telefone". */
export function telegramSender(token: string): SendMessage {
  return async (chatId, text, opts = {}) => {
    const reply_markup = opts.askContact
      ? {
          keyboard: [[{ text: "Compartilhar meu telefone", request_contact: true }]],
          resize_keyboard: true,
          one_time_keyboard: true,
        }
      : opts.removeKeyboard
        ? { remove_keyboard: true }
        : undefined;
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, ...(reply_markup ? { reply_markup } : {}) }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { description?: string };
      throw new Error(`Telegram ${res.status}: ${body.description ?? ""}`.trim());
    }
  };
}

/** Campos do Update do Telegram que o sistema usa (o resto é ignorado). */
export type TelegramUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    from?: { id: number; is_bot?: boolean; first_name?: string };
    chat: { id: number; type: string };
    date: number;
    text?: string;
    contact?: { phone_number: string; user_id?: number; first_name?: string };
  };
};
