"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  cancelAppointmentAction,
  confirmAppointmentAction,
  setQuoteStatusAction,
} from "@/app/(app)/actions";
import { runTap } from "./run-tap";

export function QuoteActions({ quoteId, label }: { quoteId: string; label: string }) {
  const [pending, start] = useTransition();
  const [refusing, setRefusing] = useState(false);
  const [reason, setReason] = useState("");
  const set = (status: "aprovado" | "recusado") =>
    start(async () => {
      const done = await runTap(() => setQuoteStatusAction(quoteId, status, reason));
      if (!done) return;
      toast.success(
        status === "aprovado"
          ? "Orçamento marcado como aprovado."
          : "Orçamento marcado como recusado.",
      );
    });

  if (refusing) {
    // Recusa pede o motivo (opcional): "achou caro", "comprou em outra loja" — fica no histórico.
    return (
      <form
        className="field"
        style={{ marginTop: 8 }}
        onSubmit={(e) => {
          e.preventDefault();
          set("recusado");
        }}
      >
        <label htmlFor={`motivo-${quoteId}`}>Por que recusou? (opcional)</label>
        <input
          id={`motivo-${quoteId}`}
          value={reason}
          maxLength={300}
          onChange={(e) => setReason(e.target.value)}
          aria-describedby={`motivo-${quoteId}-hint`}
          autoFocus
        />
        <span id={`motivo-${quoteId}-hint`} className="hint">
          Ex.: achou caro, comprou em outra loja
        </span>
        <div className="btn-row" style={{ marginTop: 8 }}>
          <button type="submit" className="btn btn-danger" disabled={pending}>
            Confirmar recusa<span className="sr-only">: {label}</span>
          </button>
          <button
            type="button"
            className="btn"
            disabled={pending}
            onClick={() => setRefusing(false)}
          >
            Voltar
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="btn-row" style={{ marginTop: 8 }}>
      <button type="button" className="btn" disabled={pending} onClick={() => set("aprovado")}>
        Aprovado<span className="sr-only">: {label}</span>
      </button>
      <button
        type="button"
        className="btn btn-danger"
        disabled={pending}
        onClick={() => setRefusing(true)}
      >
        Recusado<span className="sr-only">: {label}</span>
      </button>
    </div>
  );
}

/** Próximo agendamento na ficha: confirmar (se ainda não) e cancelar. */
export function AppointmentActions({
  appointmentId,
  confirmed,
}: {
  appointmentId: string;
  confirmed: boolean;
}) {
  const [pending, start] = useTransition();
  return (
    <div className="btn-row" style={{ marginTop: 8 }}>
      {!confirmed && (
        <button
          type="button"
          className="btn"
          disabled={pending}
          onClick={() =>
            start(async () => {
              if (await runTap(() => confirmAppointmentAction(appointmentId))) {
                toast.success("Agendamento confirmado.");
              }
            })
          }
        >
          Marcar como confirmado
        </button>
      )}
      <button
        type="button"
        className="btn btn-danger"
        disabled={pending}
        onClick={() => {
          if (!window.confirm("Cancelar este agendamento?")) return;
          start(async () => {
            if (await runTap(() => cancelAppointmentAction(appointmentId))) {
              toast.success("Agendamento cancelado. Para remarcar, crie um novo agendamento.");
            }
          });
        }}
      >
        Cancelar agendamento
      </button>
    </div>
  );
}
