"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import {
  approveReviewAction,
  rejectReviewAction,
  type ReviewFormState,
} from "@/app/(app)/revisao/actions";
import { reviewReasonLabel } from "@/lib/labels";
import type { ReviewCard as Card } from "@/lib/review/queries";

const TYPE_LABEL: Record<string, string> = {
  "customer.upserted": "Atualizar dados do cliente",
  "vehicle.identified": "Registrar veículo",
  "interaction.logged": "Registrar atendimento",
  "quote.created": "Registrar orçamento",
  "task.suggested": "Criar próxima ação",
  "appointment.requested": "Criar agendamento",
  "quote.status_changed": "Mudar situação do orçamento",
  "service.completed": "Registrar serviço feito",
};

export function ReviewCard({
  card,
  customers,
  fieldLabels,
}: {
  card: Card;
  customers: { id: string; name: string; phone: string | null }[];
  fieldLabels: Record<string, string>;
}) {
  // O aviso sai dentro da própria ação: depois de decidida, a sugestão some da lista e este
  // componente é desmontado — um useEffect não chegaria a rodar.
  const withToast =
    (action: (prev: ReviewFormState, form: FormData) => Promise<ReviewFormState>) =>
    async (prev: ReviewFormState, form: FormData) => {
      const result = await action(prev, form);
      if (result.ok && result.message) toast.success(result.message);
      return result;
    };
  const [approveState, approve, approving] = useActionState<ReviewFormState, FormData>(
    withToast(approveReviewAction),
    {},
  );
  const [rejectState, reject, rejecting] = useActionState<ReviewFormState, FormData>(
    withToast(rejectReviewAction),
    {},
  );
  const [mode, setMode] = useState<"aprovar" | "editar">("aprovar");
  const needsCustomer = !card.customer;
  const [choice, setChoice] = useState(needsCustomer ? "" : `existing:${card.customer?.id}`);

  const error = approveState.error ?? rejectState.error;
  const editable = Object.entries(card.data).filter(
    ([, v]) => typeof v === "string" || typeof v === "number",
  );
  const pct = Math.round(card.event.confidence * 100);
  const titleId = `rev-${card.id}`;

  return (
    <li className="card" aria-labelledby={titleId}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <h2 id={titleId} style={{ fontSize: "1.0625rem" }}>
          {TYPE_LABEL[card.event.type] ?? card.event.type}
        </h2>
        <span className="badge badge-warning">{reviewReasonLabel[card.reason] ?? card.reason}</span>
      </div>
      <p style={{ marginTop: 4 }}>
        {card.customer ? (
          <Link href={`/clientes/${card.customer.id}`}>{card.customer.name}</Link>
        ) : (
          <strong>Número desconhecido: {card.phone}</strong>
        )}
        <span className="muted"> · confiança do Vito: {pct}%</span>
      </p>
      {card.event.evidence && (
        <blockquote
          style={{
            margin: "10px 0 0",
            paddingLeft: 12,
            borderLeft: "3px solid var(--border-input)",
          }}
        >
          <span className="badge badge-agent" style={{ marginBottom: 4 }}>
            <Sparkles aria-hidden="true" size={14} /> Trecho da conversa
          </span>
          <p>“{card.event.evidence}”</p>
        </blockquote>
      )}

      <table className="table" style={{ marginTop: 12 }}>
        <caption className="sr-only">Proposta do Vito comparada com o dado atual</caption>
        <thead>
          <tr>
            <th scope="col">Campo</th>
            <th scope="col">Hoje no sistema</th>
            <th scope="col">Proposta do Vito</th>
          </tr>
        </thead>
        <tbody>
          {card.comparison.map((c) => (
            <tr key={c.field}>
              <th scope="row" style={{ fontWeight: 600, color: "var(--text)" }}>
                {c.field}
              </th>
              <td>{c.current}</td>
              <td>
                <strong>{c.proposed}</strong>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {error && (
        <p className="alert" role="alert" style={{ marginTop: 12 }}>
          {error}
        </p>
      )}

      <form action={approve} style={{ marginTop: 16 }}>
        <input type="hidden" name="reviewId" value={card.id} />
        <input type="hidden" name="mode" value={mode} />
        {needsCustomer && (
          <fieldset style={{ border: 0, padding: 0, margin: "0 0 12px" }}>
            <legend style={{ fontWeight: 700, marginBottom: 6 }}>De quem é esta conversa?</legend>
            <div className="field">
              <label htmlFor={`cust-${card.id}`}>Cliente</label>
              <select
                id={`cust-${card.id}`}
                name="customerChoice"
                value={choice}
                onChange={(e) => setChoice(e.target.value)}
                required
              >
                <option value="">Escolha...</option>
                <option value="new">Criar novo cliente com este telefone</option>
                {customers.map((c) => (
                  <option key={c.id} value={`existing:${c.id}`}>
                    {c.name} {c.phone ? `(${c.phone})` : ""}
                  </option>
                ))}
              </select>
            </div>
            {choice === "new" && (
              <div className="field">
                <label htmlFor={`new-${card.id}`}>Nome do novo cliente</label>
                <input id={`new-${card.id}`} name="newCustomerName" required />
              </div>
            )}
          </fieldset>
        )}
        {!needsCustomer && <input type="hidden" name="customerChoice" value={choice} />}

        {mode === "editar" && editable.length > 0 && (
          <fieldset style={{ border: 0, padding: 0, margin: "0 0 12px" }}>
            <legend style={{ fontWeight: 700, marginBottom: 6 }}>Corrigir antes de aprovar</legend>
            <div className="form-grid">
              {editable.map(([key, value]) => (
                <div className="field" key={key}>
                  <label htmlFor={`${card.id}-${key}`}>{fieldLabels[key] ?? key}</label>
                  <input
                    id={`${card.id}-${key}`}
                    name={`data.${key}`}
                    defaultValue={String(value)}
                    inputMode={typeof value === "number" ? "decimal" : undefined}
                  />
                </div>
              ))}
            </div>
          </fieldset>
        )}

        <div className="field">
          <label htmlFor={`note-${card.id}`}>Observação (opcional)</label>
          <input id={`note-${card.id}`} name="note" />
        </div>

        <div className="btn-row">
          <button type="submit" className="btn btn-primary" disabled={approving || rejecting}>
            {mode === "editar" ? "Salvar correção e aprovar" : "Aprovar"}
          </button>
          {editable.length > 0 && (
            <button
              type="button"
              className="btn"
              aria-pressed={mode === "editar"}
              onClick={() => setMode(mode === "editar" ? "aprovar" : "editar")}
            >
              {mode === "editar" ? "Cancelar edição" : "Editar e aprovar"}
            </button>
          )}
          <button
            type="submit"
            className="btn btn-danger"
            formAction={reject}
            formNoValidate
            disabled={approving || rejecting}
          >
            Rejeitar
          </button>
        </div>
      </form>
    </li>
  );
}
