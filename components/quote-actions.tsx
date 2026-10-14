"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { confirmAppointmentAction, setQuoteStatusAction } from "@/app/(app)/actions";

export function QuoteActions({ quoteId, label }: { quoteId: string; label: string }) {
  const [pending, start] = useTransition();
  const set = (status: "aprovado" | "recusado") =>
    start(async () => {
      await setQuoteStatusAction(quoteId, status);
      toast.success(
        status === "aprovado"
          ? "Orçamento marcado como aprovado."
          : "Orçamento marcado como recusado.",
      );
    });
  return (
    <div className="btn-row" style={{ marginTop: 8 }}>
      <button type="button" className="btn" disabled={pending} onClick={() => set("aprovado")}>
        Aprovado<span className="sr-only">: {label}</span>
      </button>
      <button
        type="button"
        className="btn btn-danger"
        disabled={pending}
        onClick={() => set("recusado")}
      >
        Recusado<span className="sr-only">: {label}</span>
      </button>
    </div>
  );
}

export function ConfirmAppointment({ appointmentId }: { appointmentId: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await confirmAppointmentAction(appointmentId);
          toast.success("Agendamento confirmado.");
        })
      }
    >
      Marcar como confirmado
    </button>
  );
}
