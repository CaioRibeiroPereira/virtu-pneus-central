"use client";

import { useState } from "react";
import Link from "next/link";
import { createCustomerAction, updateCustomerAction, type FormState } from "@/app/(app)/actions";
import { options, originLabel, stageLabel } from "@/lib/labels";
import { SelectField, TextAreaField, TextField } from "./field";
import { useActionForm } from "./use-action-form";

type Initial = {
  id?: string;
  version?: number;
  name?: string;
  phone?: string;
  email?: string;
  city?: string;
  origin?: string;
  stage?: string;
  lossReason?: string;
  notes?: string;
};

export function CustomerForm({
  initial = {},
  mode,
}: {
  initial?: Initial;
  mode: "create" | "edit";
}) {
  const { state, formAction, pending, formRef, onSubmit } = useActionForm<FormState>(
    mode === "create" ? createCustomerAction : updateCustomerAction,
    {},
  );
  // Depois de um envio, o formulário mostra o que foi digitado (inclusive no conflito 409).
  const v = (k: keyof Initial) => state.values?.[k] ?? String(initial[k] ?? "");
  const e = state.errors ?? {};
  const [stage, setStage] = useState(v("stage") || "novo_contato");
  const version = state.conflict?.version ?? initial.version;

  return (
    <form ref={formRef} action={formAction} onSubmit={onSubmit} noValidate className="card">
      {mode === "edit" && (
        <>
          <input type="hidden" name="id" value={initial.id} />
          <input type="hidden" name="version" value={version} />
        </>
      )}

      {(state.message || Object.keys(e).length > 0) && (
        <div className="alert" role="alert" style={{ marginBottom: 16 }}>
          {state.message ?? "Confira os campos destacados."}
          {state.conflict && (
            <p style={{ marginTop: 8, fontWeight: 400 }}>
              <Link href={`/clientes/${initial.id}`} target="_blank">
                Ver a versão atual (abre em nova aba)
              </Link>
              . Se quiser manter o que você digitou, clique em salvar de novo.
            </p>
          )}
          {state.duplicateCustomerId && (
            <p style={{ marginTop: 8, fontWeight: 400 }}>
              <Link href={`/clientes/${state.duplicateCustomerId}`}>
                Abrir o cliente que já tem este telefone
              </Link>
            </p>
          )}
        </div>
      )}

      <h2 style={{ marginBottom: 12 }}>Contato</h2>
      <div className="form-grid">
        <TextField
          name="name"
          label="Nome"
          required
          defaultValue={v("name")}
          error={e.name}
          autoComplete="off"
        />
        <TextField
          name="phone"
          label="Telefone (WhatsApp)"
          required
          type="tel"
          inputMode="tel"
          defaultValue={v("phone")}
          error={e.phone}
          hint="Com DDD, ex.: (19) 98888-7777"
        />
        <TextField
          name="email"
          label="E-mail"
          type="email"
          defaultValue={v("email")}
          error={e.email}
        />
        <TextField name="city" label="Cidade" defaultValue={v("city")} error={e.city} />
        <SelectField
          name="origin"
          label="Como chegou até a loja"
          options={options(originLabel)}
          defaultValue={v("origin") || "whatsapp"}
          error={e.origin}
        />
        <SelectField
          name="stage"
          label="Etapa"
          options={options(stageLabel)}
          value={stage}
          onChange={(ev) => setStage(ev.target.value)}
          error={e.stage}
        />
      </div>
      {stage === "perdido" && (
        <TextField
          name="lossReason"
          label="Motivo da perda"
          required
          defaultValue={v("lossReason")}
          error={e.lossReason}
          hint="Ex.: comprou em outra loja, achou caro"
        />
      )}
      <TextAreaField name="notes" label="Observações" defaultValue={v("notes")} error={e.notes} />

      {mode === "create" && (
        <>
          <h2 style={{ margin: "8px 0 12px" }}>Veículo (opcional)</h2>
          <div className="form-grid">
            <TextField
              name="vehicleModel"
              label="Modelo"
              defaultValue={state.values?.vehicleModel}
              hint="Ex.: Onix 2020"
            />
            <TextField
              name="vehiclePlate"
              label="Placa"
              defaultValue={state.values?.vehiclePlate}
              error={e.vehiclePlate}
            />
            <TextField
              name="vehicleTire"
              label="Medida do pneu"
              defaultValue={state.values?.vehicleTire}
              hint="Ex.: 185/65 R15"
            />
          </div>
        </>
      )}

      <div className="btn-row" style={{ justifyContent: "flex-end", marginTop: 8 }}>
        <Link href={mode === "edit" ? `/clientes/${initial.id}` : "/clientes"} className="btn">
          Cancelar
        </Link>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Salvando..." : mode === "create" ? "Cadastrar cliente" : "Salvar alterações"}
        </button>
      </div>
    </form>
  );
}
