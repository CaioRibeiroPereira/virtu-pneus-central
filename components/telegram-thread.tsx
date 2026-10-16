"use client";

import { useEffect, useRef, useTransition } from "react";
import { toast } from "sonner";
import { CircleCheck, Send } from "lucide-react";
import {
  closeTelegramAction,
  replyTelegramAction,
  type ReplyState,
} from "@/app/(app)/clientes/[id]/telegram-actions";
import { useActionForm } from "./use-action-form";

const AUTHOR: Record<string, string> = {
  cliente: "Cliente",
  vito: "Vito (automático)",
  gestor: "Você",
};

export type ThreadMessage = { id: string; author: string; text: string; when: string };

/**
 * Conversa do Telegram + caixa para o dono responder (D57). `variant="app"` (tela Conversas): ocupa a
 * altura da tela, como num app de mensagens, e Enter envia (Shift+Enter quebra a linha).
 */
export function TelegramThread({
  chatId,
  messages,
  variant = "card",
}: {
  chatId: string;
  messages: ThreadMessage[];
  variant?: "card" | "app";
}) {
  const app = variant === "app";
  // Abre mostrando a mensagem mais recente, como nos apps de conversa.
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [chatId, messages.length]);
  // Se o envio falhar, o texto digitado continua na caixa (só limpa depois de enviar).
  const {
    state,
    formAction,
    pending,
    formRef: form,
    onSubmit,
  } = useActionForm<ReplyState>(replyTelegramAction, {});

  const [closing, startClose] = useTransition();

  useEffect(() => {
    if (state.ok) {
      toast.success("Mensagem enviada pelo Telegram");
      form.current?.reset();
    }
  }, [state, form]);

  return (
    <div className={app ? "chat-app" : "card"}>
      {/* A área rola quando a conversa é longa: focável pelo teclado (WCAG 2.1.1), com nome. */}
      <div
        ref={scroller}
        className={app ? "chat-scroll chat-scroll-app" : "chat-scroll"}
        role="region"
        aria-label="Últimas mensagens"
        tabIndex={0}
      >
        <ol className="chat">
          {messages.map((m) => (
            <li key={m.id} className={`chat-msg chat-${m.author}`}>
              <span className="chat-meta">
                {AUTHOR[m.author] ?? m.author} · {m.when}
              </span>
              <p>{m.text}</p>
            </li>
          ))}
        </ol>
      </div>
      <form
        ref={form}
        action={formAction}
        onSubmit={onSubmit}
        className={app ? "field chat-composer" : "field"}
        style={app ? undefined : { margin: "14px 0 0" }}
      >
        <input type="hidden" name="chatId" value={chatId} />
        <label htmlFor={`tg-reply-${chatId}`} className={app ? "sr-only" : undefined}>
          Responder pelo Telegram
        </label>
        <textarea
          id={`tg-reply-${chatId}`}
          name="text"
          required
          maxLength={1000}
          rows={app ? 2 : 3}
          placeholder={app ? "Escreva uma mensagem… (Enter envia)" : undefined}
          onKeyDown={(e) => {
            if (app && e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
          aria-invalid={!!state.error || undefined}
          aria-describedby={state.error ? `tg-error-${chatId}` : undefined}
        />
        {state.error && (
          <p id={`tg-error-${chatId}`} className="field-error" role="alert">
            {state.error}
          </p>
        )}
        <div className="btn-row">
          <button type="submit" className="btn btn-primary" disabled={pending || closing}>
            <Send aria-hidden="true" size={18} /> {pending ? "Enviando…" : "Enviar"}
          </button>
          <button
            type="button"
            className="btn"
            disabled={pending || closing}
            onClick={() => {
              if (!window.confirm("Encerrar o atendimento? O cliente recebe uma despedida.")) {
                return;
              }
              startClose(async () => {
                const r = await closeTelegramAction(chatId).catch(() => ({
                  error: "Não foi possível encerrar agora. Tente de novo em instantes.",
                }));
                if ("error" in r && r.error) toast.error(r.error);
                else
                  toast.success("Atendimento encerrado. O Vito volta a responder o que é seguro.");
              });
            }}
          >
            <CircleCheck aria-hidden="true" size={18} /> Encerrar conversa
          </button>
        </div>
      </form>
    </div>
  );
}
