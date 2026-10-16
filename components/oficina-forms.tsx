"use client";

// Formulários das telas da oficina (D58). As páginas (servidor) só passam dados.
import {
  saveCatalogAction,
  saveEmployeeAction,
  saveProductAction,
  stockAdjustAction,
  stockEntryAction,
} from "@/app/(app)/oficina/actions";
import { options, serviceTypeLabel } from "@/lib/labels";
import { ActionForm } from "./action-form";
import { SelectField, TextField } from "./field";

const brl = (n?: number | null) =>
  n === undefined || n === null ? "" : n.toLocaleString("pt-BR", { minimumFractionDigits: 2 });

function ActiveBox({ id, defaultChecked }: { id: string; defaultChecked: boolean }) {
  return (
    <label className="checkbox-label" htmlFor={id}>
      <input id={id} type="checkbox" name="active" defaultChecked={defaultChecked} /> Ativo
    </label>
  );
}

// ---------- estoque ----------

export type ProductValues = {
  id?: string;
  kind: string;
  name: string;
  tireSize: string | null;
  price: number;
  minQuantity: number;
  active: boolean;
};

export function ProductForm({ product }: { product?: ProductValues }) {
  const pre = product ? `p-${product.id}-` : "p-novo-";
  return (
    <ActionForm
      title={product ? "Editar produto" : "Novo produto"}
      action={saveProductAction}
      hidden={product?.id ? { id: product.id } : {}}
      submitLabel={product ? "Salvar produto" : "Cadastrar produto"}
    >
      {(e, v) => (
        <div className="form-grid">
          <SelectField
            idPrefix={pre}
            name="kind"
            label="Tipo"
            options={[
              ["pneu", "Pneu"],
              ["item", "Outro item (válvula, peso…)"],
            ]}
            defaultValue={v.kind ?? product?.kind ?? "pneu"}
            error={e.kind}
          />
          <TextField
            idPrefix={pre}
            name="name"
            label="Nome"
            required
            hint="Ex.: Pirelli Cinturato P1"
            defaultValue={v.name ?? product?.name}
            error={e.name}
          />
          <TextField
            idPrefix={pre}
            name="tireSize"
            label="Medida"
            hint="Ex.: 205/55 R16"
            defaultValue={v.tireSize ?? product?.tireSize ?? ""}
            error={e.tireSize}
          />
          <TextField
            idPrefix={pre}
            name="price"
            label="Preço de venda (R$)"
            required
            inputMode="decimal"
            defaultValue={v.price ?? brl(product?.price)}
            error={e.price}
          />
          {!product && (
            <TextField
              idPrefix={pre}
              name="quantity"
              label="Quantidade inicial"
              required
              inputMode="numeric"
              defaultValue={v.quantity ?? "0"}
              error={e.quantity}
            />
          )}
          <TextField
            idPrefix={pre}
            name="minQuantity"
            label="Estoque mínimo"
            required
            inputMode="numeric"
            hint="Abaixo disso aparece o alerta de estoque baixo"
            defaultValue={v.minQuantity ?? String(product?.minQuantity ?? 2)}
            error={e.minQuantity}
          />
          <ActiveBox id={`${pre}active`} defaultChecked={product?.active ?? true} />
        </div>
      )}
    </ActionForm>
  );
}

export function StockEntryForm({ productId, name }: { productId: string; name: string }) {
  return (
    <ActionForm
      title={
        <>
          Entrada de mercadoria<span className="sr-only">: {name}</span>
        </>
      }
      action={stockEntryAction}
      hidden={{ id: productId }}
      submitLabel="Registrar entrada"
    >
      {(e, v) => (
        <div className="form-grid">
          <TextField
            idPrefix={`e-${productId}-`}
            name="quantity"
            label="Quantidade que chegou"
            required
            inputMode="numeric"
            defaultValue={v.quantity}
            error={e.quantity}
          />
          <TextField
            idPrefix={`e-${productId}-`}
            name="note"
            label="Observação"
            hint="Ex.: nota fiscal 1234"
            defaultValue={v.note}
            error={e.note}
          />
        </div>
      )}
    </ActionForm>
  );
}

export function StockAdjustForm({ productId, name }: { productId: string; name: string }) {
  return (
    <ActionForm
      title={
        <>
          Ajustar pela contagem<span className="sr-only">: {name}</span>
        </>
      }
      action={stockAdjustAction}
      hidden={{ id: productId }}
      submitLabel="Ajustar estoque"
    >
      {(e, v) => (
        <div className="form-grid">
          <TextField
            idPrefix={`a-${productId}-`}
            name="counted"
            label="Quantidade contada"
            required
            inputMode="numeric"
            defaultValue={v.counted}
            error={e.counted}
          />
          <TextField
            idPrefix={`a-${productId}-`}
            name="note"
            label="Motivo"
            required
            hint="Ex.: contagem mensal; pneu avariado"
            defaultValue={v.note}
            error={e.note}
          />
        </div>
      )}
    </ActionForm>
  );
}

// ---------- tabela de serviços ----------

export type CatalogValues = {
  id?: string;
  name: string;
  type: string;
  price: number;
  durationMinutes: number | null;
  active: boolean;
};

export function CatalogForm({ item }: { item?: CatalogValues }) {
  const pre = item ? `c-${item.id}-` : "c-novo-";
  return (
    <ActionForm
      title={
        item ? (
          <>
            Editar<span className="sr-only">: {item.name}</span>
          </>
        ) : (
          "Novo serviço na tabela"
        )
      }
      action={saveCatalogAction}
      hidden={item?.id ? { id: item.id } : {}}
      submitLabel={item ? "Salvar" : "Adicionar à tabela"}
    >
      {(e, v) => (
        <div className="form-grid">
          <TextField
            idPrefix={pre}
            name="name"
            label="Nome do serviço"
            required
            hint="Ex.: Alinhamento com cambagem"
            defaultValue={v.name ?? item?.name}
            error={e.name}
          />
          <SelectField
            idPrefix={pre}
            name="type"
            label="Tipo"
            options={options(serviceTypeLabel)}
            defaultValue={v.type ?? item?.type ?? "alinhamento"}
            error={e.type}
          />
          <TextField
            idPrefix={pre}
            name="price"
            label="Preço (R$)"
            required
            inputMode="decimal"
            defaultValue={v.price ?? brl(item?.price)}
            error={e.price}
          />
          <TextField
            idPrefix={pre}
            name="durationMinutes"
            label="Tempo médio (minutos)"
            inputMode="numeric"
            defaultValue={
              v.durationMinutes ?? (item?.durationMinutes ? String(item.durationMinutes) : "")
            }
            error={e.durationMinutes}
          />
          <ActiveBox id={`${pre}active`} defaultChecked={item?.active ?? true} />
        </div>
      )}
    </ActionForm>
  );
}

// ---------- equipe ----------

export type EmployeeValues = {
  id?: string;
  name: string;
  role: string;
  phoneDisplay: string | null;
  active: boolean;
};

export function EmployeeForm({ employee }: { employee?: EmployeeValues }) {
  const pre = employee ? `f-${employee.id}-` : "f-novo-";
  return (
    <ActionForm
      title={employee ? "Editar dados" : "Novo funcionário"}
      action={saveEmployeeAction}
      hidden={employee?.id ? { id: employee.id } : {}}
      submitLabel={employee ? "Salvar" : "Cadastrar"}
    >
      {(e, v) => (
        <div className="form-grid">
          <TextField
            idPrefix={pre}
            name="name"
            label="Nome"
            required
            defaultValue={v.name ?? employee?.name}
            error={e.name}
          />
          <TextField
            idPrefix={pre}
            name="role"
            label="Função"
            required
            hint="Ex.: Mecânico, Atendente"
            defaultValue={v.role ?? employee?.role}
            error={e.role}
          />
          <TextField
            idPrefix={pre}
            name="phoneDisplay"
            label="Telefone"
            type="tel"
            defaultValue={v.phoneDisplay ?? employee?.phoneDisplay ?? ""}
            error={e.phoneDisplay}
          />
          <ActiveBox id={`${pre}active`} defaultChecked={employee?.active ?? true} />
        </div>
      )}
    </ActionForm>
  );
}
