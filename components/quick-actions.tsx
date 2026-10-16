"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  addAppointmentAction,
  addQuoteAction,
  addServiceAction,
  addTaskAction,
  type FormState,
} from "@/app/(app)/actions";
import { options, serviceTypeLabel, taskTypeLabel } from "@/lib/labels";
import { SelectField, TextField } from "./field";

type Action = (prev: FormState, form: FormData) => Promise<FormState>;

/** Um formulário recolhível (<details>) que fecha e avisa quando a ação dá certo. */
function QuickForm({
  title,
  action,
  customerId,
  submitLabel,
  children,
}: {
  title: string;
  action: Action;
  customerId: string;
  submitLabel: string;
  children: (errors: Record<string, string>, values: Record<string, string>) => React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});
  const details = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (state.ok) {
      toast.success(state.message ?? "Salvo.");
      if (details.current) details.current.open = false;
    }
  }, [state]);

  return (
    <details ref={details} className="card disclosure">
      <summary>{title}</summary>
      <form action={formAction} noValidate style={{ marginTop: 12 }}>
        <input type="hidden" name="customerId" value={customerId} />
        {state.errors && (
          <p className="alert" role="alert" style={{ marginBottom: 12 }}>
            Confira os campos destacados.
          </p>
        )}
        {children(state.errors ?? {}, state.values ?? {})}
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Salvando..." : submitLabel}
        </button>
      </form>
    </details>
  );
}

export type OficinaLists = {
  employees: { id: string; name: string }[];
  catalog: { id: string; name: string; type: string; price: number }[];
  /** label: "Pirelli P1 205/55 R16 — 12 em estoque". */
  products: { id: string; label: string }[];
};

const brl = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2 });

/** "Usar da tabela de serviços": preenche os campos do mesmo formulário (sem enviar nada). */
function CatalogPicker({
  idPrefix,
  catalog,
  fill,
}: {
  idPrefix: string;
  catalog: OficinaLists["catalog"];
  fill: Record<string, (item: OficinaLists["catalog"][number]) => string>;
}) {
  if (!catalog.length) return null;
  return (
    <SelectField
      idPrefix={idPrefix}
      name="catalogPick"
      label="Usar da tabela de serviços"
      hint="Preenche descrição e valor; dá para ajustar depois"
      options={[
        ["", "—"],
        ...catalog.map((c): [string, string] => [c.id, `${c.name} — R$ ${brl(c.price)}`]),
      ]}
      defaultValue=""
      onChange={(e) => {
        const item = catalog.find((c) => c.id === e.currentTarget.value);
        const form = e.currentTarget.form;
        if (!item || !form) return;
        for (const [field, value] of Object.entries(fill)) {
          const el = form.elements.namedItem(field);
          if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement)
            el.value = value(item);
        }
      }}
    />
  );
}

export function QuickActions({
  customerId,
  today,
  lists = { employees: [], catalog: [], products: [] },
}: {
  customerId: string;
  today: string;
  lists?: OficinaLists;
}) {
  const p = (name: string) => `${name}-`; // prefixo de id, para os campos não colidirem entre formulários
  const employeeOptions: [string, string][] = [
    ["", "Ninguém em especial"],
    ...lists.employees.map((e): [string, string] => [e.id, e.name]),
  ];
  const productOptions: [string, string][] = [
    ["", "—"],
    ...lists.products.map((x): [string, string] => [x.id, x.label]),
  ];
  return (
    <div className="stack">
      <QuickForm
        title="Nova próxima ação"
        action={addTaskAction}
        customerId={customerId}
        submitLabel="Criar ação"
      >
        {(e, v) => (
          <div className="form-grid">
            <TextField
              idPrefix={p("t")}
              name="title"
              label="O que fazer"
              required
              defaultValue={v.title}
              error={e.title}
            />
            <TextField
              idPrefix={p("t")}
              name="dueDate"
              label="Quando"
              type="date"
              required
              min={today}
              defaultValue={v.dueDate ?? today}
              error={e.dueDate}
            />
            <TextField
              idPrefix={p("t")}
              name="reason"
              label="Por quê"
              required
              defaultValue={v.reason}
              error={e.reason}
              hint="Aparece no card do painel Hoje"
            />
            <SelectField
              idPrefix={p("t")}
              name="type"
              label="Tipo"
              options={options(taskTypeLabel)}
              defaultValue={v.type ?? "retorno_comercial"}
              error={e.type}
            />
            {lists.employees.length > 0 && (
              <SelectField
                idPrefix={p("t")}
                name="assigneeId"
                label="Responsável"
                options={employeeOptions}
                defaultValue={v.assigneeId ?? ""}
                error={e.assigneeId}
              />
            )}
          </div>
        )}
      </QuickForm>

      <QuickForm
        title="Novo orçamento"
        action={addQuoteAction}
        customerId={customerId}
        submitLabel="Registrar orçamento enviado"
      >
        {(e, v) => (
          <div className="form-grid">
            <CatalogPicker
              idPrefix={p("q")}
              catalog={lists.catalog}
              fill={{ description: (c) => c.name, total: (c) => brl(c.price) }}
            />
            <TextField
              idPrefix={p("q")}
              name="description"
              label="Descrição"
              required
              defaultValue={v.description}
              error={e.description}
              hint="Ex.: 4 pneus 205/55 R16 + alinhamento"
            />
            <TextField
              idPrefix={p("q")}
              name="total"
              label="Valor total (R$)"
              required
              inputMode="decimal"
              defaultValue={v.total}
              error={e.total}
              hint="Ex.: 1.840,00"
            />
            <TextField
              idPrefix={p("q")}
              name="tireSize"
              label="Medida do pneu"
              defaultValue={v.tireSize}
              error={e.tireSize}
            />
            <TextField
              idPrefix={p("q")}
              name="quantity"
              label="Quantidade"
              inputMode="numeric"
              defaultValue={v.quantity}
              error={e.quantity}
            />
            <TextField
              idPrefix={p("q")}
              name="validUntil"
              label="Válido até"
              type="date"
              min={today}
              defaultValue={v.validUntil}
              error={e.validUntil}
            />
          </div>
        )}
      </QuickForm>

      <QuickForm
        title="Registrar serviço feito"
        action={addServiceAction}
        customerId={customerId}
        submitLabel="Registrar serviço"
      >
        {(e, v) => (
          <div className="form-grid">
            <CatalogPicker
              idPrefix={p("s")}
              catalog={lists.catalog}
              fill={{ type: (c) => c.type, description: (c) => c.name, total: (c) => brl(c.price) }}
            />
            <SelectField
              idPrefix={p("s")}
              name="type"
              label="Serviço"
              options={options(serviceTypeLabel)}
              defaultValue={v.type ?? "troca_pneus"}
              error={e.type}
            />
            <TextField
              idPrefix={p("s")}
              name="date"
              label="Data"
              type="date"
              required
              max={today}
              defaultValue={v.date ?? today}
              error={e.date}
            />
            <TextField
              idPrefix={p("s")}
              name="description"
              label="Descrição"
              required
              defaultValue={v.description}
              error={e.description}
            />
            <TextField
              idPrefix={p("s")}
              name="total"
              label="Valor (R$)"
              inputMode="decimal"
              defaultValue={v.total}
              error={e.total}
            />
            <TextField
              idPrefix={p("s")}
              name="km"
              label="Quilometragem"
              inputMode="numeric"
              defaultValue={v.km}
              error={e.km}
            />
            {lists.employees.length > 0 && (
              <SelectField
                idPrefix={p("s")}
                name="employeeId"
                label="Quem fez"
                options={employeeOptions}
                defaultValue={v.employeeId ?? ""}
                error={e.employeeId}
              />
            )}
            {lists.products.length > 0 && (
              <fieldset
                className="field"
                style={{ gridColumn: "1 / -1", border: 0, padding: 0, margin: 0 }}
              >
                <legend className="label" style={{ marginBottom: 6 }}>
                  Itens do estoque usados (baixa automática)
                </legend>
                {[1, 2, 3].map((n) => (
                  <div key={n} className="form-grid" style={{ gridTemplateColumns: "1fr 110px" }}>
                    <SelectField
                      idPrefix={p("s")}
                      name={`item_product_${n}`}
                      label={`Produto ${n}`}
                      options={productOptions}
                      defaultValue=""
                    />
                    <TextField
                      idPrefix={p("s")}
                      name={`item_qty_${n}`}
                      label="Qtd."
                      inputMode="numeric"
                      defaultValue=""
                    />
                  </div>
                ))}
                {e.items && (
                  <p className="field-error" role="alert">
                    {e.items}
                  </p>
                )}
              </fieldset>
            )}
          </div>
        )}
      </QuickForm>

      <QuickForm
        title="Novo agendamento"
        action={addAppointmentAction}
        customerId={customerId}
        submitLabel="Agendar"
      >
        {(e, v) => (
          <div className="form-grid">
            <TextField
              idPrefix={p("a")}
              name="date"
              label="Dia"
              type="date"
              required
              min={today}
              defaultValue={v.date}
              error={e.date}
            />
            <TextField
              idPrefix={p("a")}
              name="time"
              label="Horário"
              type="time"
              required
              defaultValue={v.time ?? "09:00"}
              error={e.time}
            />
            <SelectField
              idPrefix={p("a")}
              name="serviceType"
              label="Serviço"
              options={options(serviceTypeLabel)}
              defaultValue={v.serviceType ?? "alinhamento"}
              error={e.serviceType}
            />
          </div>
        )}
      </QuickForm>
    </div>
  );
}
