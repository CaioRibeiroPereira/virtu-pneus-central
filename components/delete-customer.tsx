"use client";

// Exclusão do cliente a pedido do titular (LGPD, D64): confirmação digitando o nome (§9 do plano).
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { deleteCustomerAction, type FormState } from "@/app/(app)/actions";
import { useActionForm } from "./use-action-form";

export function DeleteCustomer({ id, name }: { id: string; name: string }) {
  const { state, formAction, pending, formRef, onSubmit } = useActionForm<FormState>(
    deleteCustomerAction,
    {},
  );
  const [typed, setTyped] = useState("");
  const matches =
    typed.trim().toLocaleLowerCase("pt-BR") === name.trim().toLocaleLowerCase("pt-BR");
  const error = state.errors?.confirmName ?? state.message;
  return (
    <details className="card disclosure danger-zone">
      <summary>Excluir cliente (LGPD)</summary>
      <form
        ref={formRef}
        action={formAction}
        onSubmit={onSubmit}
        noValidate
        style={{ marginTop: 12 }}
      >
        <input type="hidden" name="id" value={id} />
        <p style={{ marginBottom: 12 }}>
          Apaga <strong>{name}</strong> e tudo o que é dele: veículos, orçamentos, serviços,
          agendamentos, ações, atendimentos, sugestões do Vito e a conversa do Telegram. Não dá para
          desfazer. Use quando o cliente pedir a exclusão dos dados dele.
        </p>
        <div className="field">
          <label htmlFor="confirmName">Para confirmar, digite o nome do cliente: {name}</label>
          <input
            id="confirmName"
            name="confirmName"
            autoComplete="off"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "confirmName-error" : undefined}
          />
          {error && (
            <span id="confirmName-error" className="field-error" role="alert">
              {error}
            </span>
          )}
        </div>
        <button type="submit" className="btn btn-danger" disabled={pending || !matches}>
          <Trash2 aria-hidden="true" size={18} />{" "}
          {pending ? "Excluindo..." : "Excluir definitivamente"}
        </button>
      </form>
    </details>
  );
}
