"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Clock, MessageCircle } from "lucide-react";
import { completeTaskAction, reopenTaskAction, snoozeTaskAction } from "@/app/(app)/actions";
import { formatDate } from "@/lib/dates";
import { runTap } from "./run-tap";

/**
 * Botões de 1 toque de uma próxima ação: WhatsApp, Concluir (com desfazer) e Adiar.
 * `compact` (tela Hoje): WhatsApp ocupa a largura; Concluir e Adiar só com ícone — o nome
 * acessível continua "Concluir…"/"Adiar…".
 */
export function TaskActions({
  taskId,
  title,
  whatsappHref,
  customerName,
  today,
  compact = false,
}: {
  taskId: string;
  title: string;
  whatsappHref: string | null;
  customerName: string;
  /** Dia da loja: a data escolhida para adiar não pode ser antes dele. */
  today: string;
  compact?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [customDate, setCustomDate] = useState("");

  const complete = () =>
    startTransition(async () => {
      const done = await runTap(() => completeTaskAction(taskId));
      if (!done) return;
      toast.success(
        `Concluído: ${title} (${customerName})${done.message ? `. ${done.message}` : ""}`,
        {
          duration: 5000,
          action: {
            label: "Desfazer",
            onClick: () =>
              startTransition(async () => {
                await runTap(() => reopenTaskAction(taskId));
              }),
          },
        },
      );
    });

  const snooze = (when: string) =>
    startTransition(async () => {
      const done = await runTap(() => snoozeTaskAction(taskId, when));
      if (done?.message) toast.success(`Adiado para ${formatDate(done.message)}: ${customerName}`);
    });

  return (
    <div
      className={compact ? "task-actions" : "btn-row"}
      style={compact ? undefined : { marginTop: 12 }}
    >
      {whatsappHref && (
        <a
          className="btn btn-primary"
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
        >
          <MessageCircle aria-hidden="true" size={18} />
          {compact && <span className="wide-only">Chamar no </span>}
          WhatsApp
          <span className="sr-only"> para {customerName} (abre em nova aba)</span>
        </a>
      )}
      <button type="button" className="btn" onClick={complete} disabled={pending}>
        <Check aria-hidden="true" size={18} />
        <span className={compact ? "sr-only" : undefined}>Concluir</span>
        <span className="sr-only">
          : {title} de {customerName}
        </span>
      </button>
      <details className="snooze">
        <summary className="btn" aria-label={`Adiar: ${title} de ${customerName}`}>
          <Clock aria-hidden="true" size={18} />
          {!compact && " Adiar"}
        </summary>
        <div className="card" style={{ marginTop: 8, display: "grid", gap: 8 }}>
          <button type="button" className="btn" disabled={pending} onClick={() => snooze("amanha")}>
            Para amanhã
          </button>
          <button type="button" className="btn" disabled={pending} onClick={() => snooze("3dias")}>
            Daqui a 3 dias
          </button>
          <form
            className="field"
            style={{ marginBottom: 0 }}
            onSubmit={(e) => {
              e.preventDefault();
              if (customDate) snooze(customDate);
            }}
          >
            <label htmlFor={`snooze-${taskId}`}>Escolher data</label>
            <div className="btn-row">
              <input
                id={`snooze-${taskId}`}
                type="date"
                value={customDate}
                min={today}
                onChange={(e) => setCustomDate(e.target.value)}
                required
                style={{ flex: 1 }}
              />
              <button type="submit" className="btn" disabled={pending || !customDate}>
                Adiar
              </button>
            </div>
          </form>
        </div>
      </details>
    </div>
  );
}
