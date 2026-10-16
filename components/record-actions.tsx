"use client";

// Corrigir ou excluir um orçamento ou serviço já registrado, no histórico da ficha (D64).
import { useTransition } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import {
  deleteQuoteAction,
  deleteServiceAction,
  updateQuoteAction,
  updateServiceAction,
} from "@/app/(app)/actions";
import { options, serviceTypeLabel } from "@/lib/labels";
import { ActionForm } from "./action-form";
import { SelectField, TextField } from "./field";
import { runTap } from "./run-tap";

const brl = (n?: number | null) =>
  n === undefined || n === null ? "" : n.toLocaleString("pt-BR", { minimumFractionDigits: 2 });

function DeleteButton({
  label,
  run,
}: {
  label: string;
  run: () => ReturnType<typeof deleteQuoteAction>;
}) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn btn-danger"
      disabled={pending}
      style={{ marginLeft: 8 }}
      onClick={() => {
        if (!window.confirm(`Excluir ${label}? Não dá para desfazer.`)) return;
        start(async () => {
          const done = await runTap(run);
          if (done?.message) toast.success(done.message);
        });
      }}
    >
      <Trash2 aria-hidden="true" size={18} /> Excluir {label}
    </button>
  );
}

export type QuoteRecord = {
  id: string;
  description: string;
  total: number;
  tireSize: string | null;
  quantity: number | null;
  validUntil: string | null;
};

export function QuoteRecordActions({ quote }: { quote: QuoteRecord }) {
  const pre = `eq-${quote.id}-`;
  const DELETE = <DeleteButton label="este orçamento" run={() => deleteQuoteAction(quote.id)} />;
  return (
    <div style={{ marginTop: 8 }}>
      <ActionForm
        title={
          <>
            Corrigir ou excluir<span className="sr-only">: orçamento {quote.description}</span>
          </>
        }
        action={updateQuoteAction}
        hidden={{ id: quote.id, quoteId: quote.id }}
        submitLabel="Salvar correção"
        extra={DELETE}
      >
        {(e, v) => (
          <>
            <div className="form-grid">
              <TextField
                idPrefix={pre}
                name="description"
                label="Descrição"
                required
                defaultValue={v.description ?? quote.description}
                error={e.description}
              />
              <TextField
                idPrefix={pre}
                name="total"
                label="Valor total (R$)"
                required
                inputMode="decimal"
                defaultValue={v.total ?? brl(quote.total)}
                error={e.total}
              />
              <TextField
                idPrefix={pre}
                name="tireSize"
                label="Medida do pneu"
                defaultValue={v.tireSize ?? quote.tireSize ?? ""}
                error={e.tireSize}
              />
              <TextField
                idPrefix={pre}
                name="quantity"
                label="Quantidade"
                inputMode="numeric"
                defaultValue={v.quantity ?? (quote.quantity != null ? String(quote.quantity) : "")}
                error={e.quantity}
              />
              <TextField
                idPrefix={pre}
                name="validUntil"
                label="Válido até"
                type="date"
                defaultValue={v.validUntil ?? quote.validUntil ?? ""}
                error={e.validUntil}
              />
            </div>
          </>
        )}
      </ActionForm>
    </div>
  );
}

export type ServiceRecord = {
  id: string;
  type: string;
  description: string;
  date: string;
  total: number | null;
  km: number | null;
  employeeId: string | null;
};

export function ServiceRecordActions({
  service,
  today,
  employees,
}: {
  service: ServiceRecord;
  today: string;
  employees: { id: string; name: string }[];
}) {
  const pre = `es-${service.id}-`;
  const DELETE = <DeleteButton label="este serviço" run={() => deleteServiceAction(service.id)} />;
  return (
    <div style={{ marginTop: 8 }}>
      <ActionForm
        title={
          <>
            Corrigir ou excluir<span className="sr-only">: serviço {service.description}</span>
          </>
        }
        action={updateServiceAction}
        hidden={{ id: service.id, serviceId: service.id }}
        submitLabel="Salvar correção"
        extra={DELETE}
      >
        {(e, v) => (
          <>
            <div className="form-grid">
              <SelectField
                idPrefix={pre}
                name="type"
                label="Serviço"
                options={options(serviceTypeLabel)}
                defaultValue={v.type ?? service.type}
                error={e.type}
              />
              <TextField
                idPrefix={pre}
                name="date"
                label="Data"
                type="date"
                required
                max={today}
                defaultValue={v.date ?? service.date}
                error={e.date}
              />
              <TextField
                idPrefix={pre}
                name="description"
                label="Descrição"
                required
                defaultValue={v.description ?? service.description}
                error={e.description}
              />
              <TextField
                idPrefix={pre}
                name="total"
                label="Valor (R$)"
                inputMode="decimal"
                defaultValue={v.total ?? brl(service.total)}
                error={e.total}
              />
              <TextField
                idPrefix={pre}
                name="km"
                label="Quilometragem"
                inputMode="numeric"
                defaultValue={v.km ?? (service.km != null ? String(service.km) : "")}
                error={e.km}
              />
              <SelectField
                idPrefix={pre}
                name="employeeId"
                label="Quem fez"
                options={[
                  ["", "Ninguém em especial"],
                  ...employees.map((x): [string, string] => [x.id, x.name]),
                ]}
                defaultValue={v.employeeId ?? service.employeeId ?? ""}
                error={e.employeeId}
              />
            </div>
            <p className="muted" style={{ marginBottom: 12, fontSize: "0.875rem" }}>
              Os itens do estoque não mudam aqui. Para corrigir o estoque, use o ajuste na tela
              Estoque, ou exclua o serviço: os itens voltam ao estoque.
            </p>
          </>
        )}
      </ActionForm>
    </div>
  );
}
