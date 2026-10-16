"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import {
  approveReviewAction,
  rejectReviewAction,
  type ReviewFormState,
} from "@/app/(app)/revisao/actions";
import { agentEventTitle, reviewReasonLabel } from "@/lib/labels";
import type { ReviewCard as Card } from "@/lib/review/queries";
import { EDIT_FIELDS, editDefaults, type EditField } from "@/lib/review/fields";
import type { StockSuggestion } from "@/lib/oficina/suggest";

/** Campo de correção com o tipo certo (data, dia e hora, valor, lista). */
function EditInput({ cardId, field, value }: { cardId: string; field: EditField; value: unknown }) {
  const id = `${cardId}-${field.key}`;
  const defaults = editDefaults(field, value);
  if (field.kind === "datetime") {
    return (
      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="label">{field.label}</legend>
        <div className="btn-row">
          <label className="sr-only" htmlFor={`${id}-date`}>
            {field.label}: dia
          </label>
          <input
            id={`${id}-date`}
            type="date"
            name={`data.${field.key}__date`}
            defaultValue={defaults[`${field.key}__date`]}
            style={{ flex: 1 }}
          />
          <label className="sr-only" htmlFor={`${id}-time`}>
            {field.label}: horário
          </label>
          <input
            id={`${id}-time`}
            type="time"
            name={`data.${field.key}__time`}
            defaultValue={defaults[`${field.key}__time`]}
            style={{ width: 130 }}
          />
        </div>
      </fieldset>
    );
  }
  return (
    <div className="field">
      <label htmlFor={id}>{field.label}</label>
      {field.kind === "select" ? (
        <select id={id} name={`data.${field.key}`} defaultValue={defaults[field.key]}>
          {!field.required && <option value="">—</option>}
          {field.options?.map(([v, text]) => (
            <option key={v} value={v}>
              {text}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          name={`data.${field.key}`}
          type={field.kind === "date" ? "date" : field.kind === "email" ? "email" : "text"}
          inputMode={
            field.kind === "money" ? "decimal" : field.kind === "int" ? "numeric" : undefined
          }
          defaultValue={defaults[field.key]}
        />
      )}
    </div>
  );
}

export function ReviewCard({
  card,
  customers,
  stock,
}: {
  card: Card;
  customers: { id: string; name: string; phone: string | null }[];
  /** "Serviço feito": produtos do estoque e a sugestão de baixa (D59). */
  stock?: { products: { id: string; label: string }[]; suggestion: StockSuggestion };
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
  // Erro da última decisão tentada (aprovar ou rejeitar), com o foco levado até ele.
  const [lastIntent, setLastIntent] = useState<"aprovar" | "rejeitar">("aprovar");
  const lastError = lastIntent === "rejeitar" ? rejectState.error : approveState.error;
  const alertRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (approveState.error || rejectState.error) alertRef.current?.focus();
  }, [approveState, rejectState]);

  const fields = EDIT_FIELDS[card.event.type] ?? [];
  const pct = Math.round(card.event.confidence * 100);
  const titleId = `rev-${card.id}`;

  return (
    <li className="card" aria-labelledby={titleId}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <h2 id={titleId} style={{ fontSize: "1.0625rem" }}>
          {agentEventTitle[card.event.type] ?? card.event.type}
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
        <span className="badge" style={{ marginLeft: 8 }}>
          via {card.event.channel}
        </span>
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

      {lastError && (
        <p ref={alertRef} tabIndex={-1} className="alert" role="alert" style={{ marginTop: 12 }}>
          {lastError}
        </p>
      )}

      {/* Envio pelo onSubmit (sem a limpeza automática do React): com erro, as correções, o
          cliente escolhido e os itens do estoque continuam como o gestor deixou. */}
      <form
        action={approve}
        onSubmit={(e) => {
          e.preventDefault();
          const submitter = (e.nativeEvent as SubmitEvent).submitter;
          const data = new FormData(e.currentTarget, submitter);
          const intent = data.get("intent") === "rejeitar" ? "rejeitar" : "aprovar";
          setLastIntent(intent);
          startTransition(() => (intent === "rejeitar" ? reject : approve)(data));
        }}
        style={{ marginTop: 16 }}
      >
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

        {mode === "editar" && fields.length > 0 && (
          <fieldset style={{ border: 0, padding: 0, margin: "0 0 12px" }}>
            <legend style={{ fontWeight: 700, marginBottom: 6 }}>Corrigir antes de aprovar</legend>
            <div className="form-grid">
              {fields.map((f) => (
                <EditInput key={f.key} cardId={card.id} field={f} value={card.data[f.key]} />
              ))}
            </div>
          </fieldset>
        )}

        {card.event.type === "service.completed" && stock && stock.products.length > 0 && (
          <fieldset style={{ border: 0, padding: 0, margin: "0 0 12px" }}>
            <legend style={{ fontWeight: 700, marginBottom: 6 }}>
              Itens do estoque usados (baixa ao aprovar)
            </legend>
            {stock.suggestion.note && (
              <p className="muted" style={{ marginBottom: 8 }}>
                <Sparkles aria-hidden="true" size={14} style={{ verticalAlign: "-2px" }} />{" "}
                {stock.suggestion.note}
              </p>
            )}
            {[1, 2, 3].map((n) => {
              const suggested = stock.suggestion.items[n - 1];
              return (
                <div key={n} className="form-grid" style={{ gridTemplateColumns: "1fr 110px" }}>
                  <div className="field">
                    <label htmlFor={`${card.id}-item-${n}`}>Produto {n}</label>
                    <select
                      id={`${card.id}-item-${n}`}
                      name={`item_product_${n}`}
                      defaultValue={suggested?.productId ?? ""}
                    >
                      <option value="">—</option>
                      {stock.products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor={`${card.id}-qty-${n}`}>Qtd.</label>
                    <input
                      id={`${card.id}-qty-${n}`}
                      name={`item_qty_${n}`}
                      inputMode="numeric"
                      defaultValue={suggested ? String(suggested.quantity) : ""}
                    />
                  </div>
                </div>
              );
            })}
          </fieldset>
        )}

        <div className="field">
          <label htmlFor={`note-${card.id}`}>Observação (opcional)</label>
          <input id={`note-${card.id}`} name="note" />
        </div>

        <div className="btn-row">
          <button
            type="submit"
            name="intent"
            value="aprovar"
            className="btn btn-primary"
            disabled={approving || rejecting}
          >
            {mode === "editar" ? "Salvar correção e aprovar" : "Aprovar"}
          </button>
          {fields.length > 0 && (
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
            name="intent"
            value="rejeitar"
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
