"use server";

// Ações das telas da oficina (D58): estoque, tabela de serviços e equipe. Mesmo padrão das ações
// da ficha: confere a sessão, valida com zod, grava com auditoria e atualiza as telas.
import { revalidatePath } from "next/cache";
import type { ZodType } from "zod";
import { getDb, withTransactionalDb } from "@/db";
import { requireSession } from "@/lib/auth/session";
import { fieldErrors, formToObject } from "@/lib/customers/input";
import {
  addStockEntry,
  adjustStock,
  createProduct,
  StockError,
  updateProduct,
} from "@/lib/oficina/inventory";
import {
  adjustForm,
  catalogForm,
  employeeForm,
  entryForm,
  newProductForm,
  productForm,
} from "@/lib/oficina/input";
import {
  createCatalogItem,
  createEmployee,
  updateCatalogItem,
  updateEmployee,
} from "@/lib/oficina/team";
import type { FormState } from "../actions";

const UUID = /^[0-9a-f-]{36}$/i;

async function run<T>(
  form: FormData,
  keys: string[],
  schema: ZodType<T>,
  exec: (data: T, id: string | null) => Promise<unknown>,
  message: string,
  paths: string[],
): Promise<FormState> {
  await requireSession();
  const raw = String(form.get("id") ?? "");
  const id = UUID.test(raw) ? raw : null;
  const values = formToObject(form, keys);
  // Checkbox desmarcado não vem no formulário: formToObject devolve "", que vira false.
  const parsed = schema.safeParse(values);
  if (!parsed.success) return { values, errors: fieldErrors(parsed.error) };
  try {
    await exec(parsed.data, id);
  } catch (err) {
    if (err instanceof StockError) return { values, errors: { _form: err.message } };
    throw err;
  }
  for (const p of paths) revalidatePath(p);
  return { ok: true, message };
}

// ---------- estoque ----------

export async function saveProductAction(_prev: FormState, form: FormData) {
  const isNew = !UUID.test(String(form.get("id") ?? ""));
  const keys = [
    "kind",
    "name",
    "tireSize",
    "price",
    "minQuantity",
    "active",
    ...(isNew ? ["quantity"] : []),
  ];
  return isNew
    ? run(
        form,
        keys,
        newProductForm,
        (d) => withTransactionalDb((db) => createProduct(db, d)),
        "Produto cadastrado.",
        ["/estoque"],
      )
    : run(
        form,
        keys,
        productForm,
        (d, id) => withTransactionalDb((db) => updateProduct(db, id!, d)),
        "Produto atualizado.",
        ["/estoque", `/estoque/${form.get("id")}`],
      );
}

export async function stockEntryAction(_prev: FormState, form: FormData) {
  return run(
    form,
    ["quantity", "note"],
    entryForm,
    (d, id) => withTransactionalDb((db) => addStockEntry(db, id!, d.quantity, d.note)),
    "Entrada registrada.",
    ["/estoque", `/estoque/${form.get("id")}`, "/hoje"],
  );
}

export async function stockAdjustAction(_prev: FormState, form: FormData) {
  return run(
    form,
    ["counted", "note"],
    adjustForm,
    (d, id) => withTransactionalDb((db) => adjustStock(db, id!, d.counted, d.note)),
    "Estoque ajustado.",
    ["/estoque", `/estoque/${form.get("id")}`, "/hoje"],
  );
}

// ---------- tabela de serviços ----------

export async function saveCatalogAction(_prev: FormState, form: FormData) {
  return run(
    form,
    ["name", "type", "price", "durationMinutes", "active"],
    catalogForm,
    (d, id) => (id ? updateCatalogItem(getDb(), id, d) : createCatalogItem(getDb(), d)),
    "Tabela de serviços atualizada.",
    ["/servicos"],
  );
}

// ---------- equipe ----------

export async function saveEmployeeAction(_prev: FormState, form: FormData) {
  return run(
    form,
    ["name", "role", "phoneDisplay", "active"],
    employeeForm,
    (d, id) => (id ? updateEmployee(getDb(), id, d) : createEmployee(getDb(), d)),
    "Equipe atualizada.",
    ["/equipe", `/equipe/${form.get("id")}`],
  );
}
