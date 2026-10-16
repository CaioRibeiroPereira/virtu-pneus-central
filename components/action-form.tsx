"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import type { FormState } from "@/app/(app)/actions";
import { useActionForm } from "./use-action-form";

type Action = (prev: FormState, form: FormData) => Promise<FormState>;

/** Formulário recolhível genérico (telas da oficina): avisa e fecha quando dá certo. */
export function ActionForm({
  title,
  action,
  hidden = {},
  submitLabel,
  open = false,
  extra,
  children,
}: {
  title: React.ReactNode;
  action: Action;
  hidden?: Record<string, string>;
  submitLabel: string;
  open?: boolean;
  /** Mostrado depois do botão de salvar, dentro do formulário (ex.: "Excluir"). */
  extra?: React.ReactNode;
  children: (errors: Record<string, string>, values: Record<string, string>) => React.ReactNode;
}) {
  const { state, formAction, pending, formRef, onSubmit } = useActionForm<FormState>(action, {});
  const details = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (state.ok) {
      toast.success(state.message ?? "Salvo.");
      if (details.current && !open) details.current.open = false;
      // Cadastro novo: limpa para o próximo. Edição: os campos já mostram o que foi salvo.
      if (!hidden.id) formRef.current?.reset();
    }
  }, [state, open, hidden.id, formRef]);

  return (
    <details ref={details} className="card disclosure" open={open || undefined}>
      <summary>{title}</summary>
      <form
        ref={formRef}
        action={formAction}
        onSubmit={onSubmit}
        noValidate
        style={{ marginTop: 12 }}
      >
        {Object.entries(hidden).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        {state.errors && Object.keys(state.errors).length > 0 && (
          <p className="alert" role="alert" style={{ marginBottom: 12 }}>
            {state.errors._form ?? "Confira os campos destacados."}
          </p>
        )}
        {children(state.errors ?? {}, state.values ?? {})}
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Salvando..." : submitLabel}
        </button>
        {extra}
      </form>
    </details>
  );
}
