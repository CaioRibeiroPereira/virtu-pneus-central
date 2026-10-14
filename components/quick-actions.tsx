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

export function QuickActions({ customerId, today }: { customerId: string; today: string }) {
  const p = (name: string) => `${name}-`; // prefixo de id, para os campos não colidirem entre formulários
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
