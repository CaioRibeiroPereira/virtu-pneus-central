"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { replyTelegramAction, type ReplyState } from "@/app/(app)/clientes/[id]/telegram-actions";

const AUTHOR: Record<string, string> = {
  cliente: "Cliente",
  vito: "Vito (automático)",
  gestor: "Você",
};

export type ThreadMessage = { id: string; author: string; text: string; when: string };

/** Conversa do Telegram na ficha + caixa para o dono responder (D57). */
export function TelegramThread({
  customerId,
  messages,
}: {
  customerId: string;
  messages: ThreadMessage[];
}) {
  const [state, action, pending] = useActionState<ReplyState, FormData>(replyTelegramAction, {});
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      toast.success("Mensagem enviada pelo Telegram");
      form.current?.reset();
    }
  }, [state]);

  return (
    <div className="card">
      <ol className="chat" aria-label="Últimas mensagens">
        {messages.map((m) => (
          <li key={m.id} className={`chat-msg chat-${m.author}`}>
            <span className="chat-meta">
              {AUTHOR[m.author] ?? m.author} · {m.when}
            </span>
            <p>{m.text}</p>
          </li>
        ))}
      </ol>
      <form ref={form} action={action} className="field" style={{ margin: "14px 0 0" }}>
        <input type="hidden" name="customerId" value={customerId} />
        <label htmlFor="tg-reply">Responder pelo Telegram</label>
        <textarea
          id="tg-reply"
          name="text"
          required
          maxLength={1000}
          rows={3}
          aria-invalid={!!state.error || undefined}
          aria-describedby={state.error ? "tg-error" : undefined}
        />
        {state.error && (
          <p id="tg-error" className="field-error" role="alert">
            {state.error}
          </p>
        )}
        <div className="btn-row">
          <button type="submit" className="btn btn-primary" disabled={pending}>
            <Send aria-hidden="true" size={18} /> {pending ? "Enviando…" : "Enviar"}
          </button>
        </div>
      </form>
    </div>
  );
}
