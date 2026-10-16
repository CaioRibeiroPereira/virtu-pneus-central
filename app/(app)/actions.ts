"use server";

// Ações do gestor (Server Actions). Cada uma: confere a sessão (além do proxy), valida com zod,
// executa o comando numa transação e atualiza as telas afetadas.
import { revalidatePath } from "next/cache";
import type { ZodType } from "zod";
import { redirect } from "next/navigation";
import { withTransactionalDb } from "@/db";
import { requireSession } from "@/lib/auth/session";
import {
  addAppointment,
  addQuote,
  addService,
  addTask,
  createCustomer,
  setAppointmentStatus,
  setQuoteStatus,
  setTaskStatus,
  snoozeTask,
} from "@/lib/customers/commands";
import {
  appointmentForm,
  customerForm,
  fieldErrors,
  formToObject,
  parseServiceItems,
  quoteForm,
  serviceForm,
  taskForm,
  vehicleForm,
} from "@/lib/customers/input";
import { updateCustomerByGestor } from "@/lib/customers/update";
import { addDays, todayInStore } from "@/lib/dates";
import { StockError } from "@/lib/oficina/inventory";

export type FormState = {
  ok?: boolean;
  message?: string;
  errors?: Record<string, string>;
  values?: Record<string, string>;
  /** Conflito de versão (409): o formulário mantém o que foi digitado. */
  conflict?: { version: number };
  duplicateCustomerId?: string;
};

function refresh(customerId?: string) {
  revalidatePath("/hoje");
  revalidatePath("/clientes");
  if (customerId) revalidatePath(`/clientes/${customerId}`);
}

const CUSTOMER_KEYS = ["name", "phone", "email", "city", "origin", "stage", "lossReason", "notes"];
const VEHICLE_KEYS = ["vehicleModel", "vehiclePlate", "vehicleTire"];

// ---------- Clientes ----------

export async function createCustomerAction(_prev: FormState, form: FormData): Promise<FormState> {
  await requireSession();
  const values = formToObject(form, [...CUSTOMER_KEYS, ...VEHICLE_KEYS]);
  const parsed = customerForm.safeParse(values);
  const vehicle = vehicleForm.safeParse(values);
  if (!parsed.success || !vehicle.success) {
    return {
      values,
      errors: {
        ...(parsed.success ? {} : fieldErrors(parsed.error)),
        ...(vehicle.success ? {} : fieldErrors(vehicle.error)),
      },
    };
  }
  const result = await withTransactionalDb((db) => createCustomer(db, parsed.data, vehicle.data));
  if (!result.ok) {
    if (result.reason === "invalid_phone") {
      return { values, errors: { phone: "Telefone inválido. Inclua o DDD, ex.: (19) 98888-7777" } };
    }
    return {
      values,
      errors: { phone: "Já existe um cliente com este telefone." },
      duplicateCustomerId: result.existingCustomerId,
    };
  }
  refresh(result.id);
  redirect(`/clientes/${result.id}`);
}

export async function updateCustomerAction(_prev: FormState, form: FormData): Promise<FormState> {
  await requireSession();
  const id = String(form.get("id") ?? "");
  const version = Number(form.get("version"));
  const values = formToObject(form, CUSTOMER_KEYS);
  const parsed = customerForm.safeParse(values);
  if (!parsed.success) return { values, errors: fieldErrors(parsed.error) };

  const result = await withTransactionalDb((db) =>
    updateCustomerByGestor(db, id, version, {
      ...parsed.data,
      email: parsed.data.email ?? null,
      city: parsed.data.city ?? null,
      lossReason: parsed.data.stage === "perdido" ? (parsed.data.lossReason ?? null) : null,
      notes: parsed.data.notes ?? null,
    }),
  );
  if (!result.ok) {
    switch (result.reason) {
      case "conflict":
        return {
          values,
          conflict: { version: result.current.version },
          message:
            "Este cliente foi alterado (por você em outra tela ou pelo Vito) enquanto você editava. Seus dados continuam no formulário.",
        };
      case "invalid_phone":
        return { values, errors: { phone: "Telefone inválido. Inclua o DDD." } };
      case "duplicate_phone":
        return {
          values,
          errors: { phone: "Já existe outro cliente com este telefone." },
          duplicateCustomerId: result.existingCustomerId,
        };
      case "loss_reason_required":
        return { values, errors: { lossReason: "Informe o motivo da perda" } };
      case "not_found":
        return { message: "Cliente não encontrado." };
    }
  }
  refresh(id);
  redirect(`/clientes/${id}`);
}

// ---------- Ações rápidas da ficha ----------

async function quickAction<T>(
  form: FormData,
  keys: string[],
  schema: ZodType<T>,
  run: (customerId: string, data: T) => Promise<unknown>,
  successMessage: string,
): Promise<FormState> {
  await requireSession();
  const customerId = String(form.get("customerId") ?? "");
  const values = formToObject(form, keys);
  const parsed = schema.safeParse(values);
  if (!parsed.success) return { values, errors: fieldErrors(parsed.error) };
  await run(customerId, parsed.data);
  refresh(customerId);
  return { ok: true, message: successMessage };
}

export async function addTaskAction(_prev: FormState, form: FormData) {
  return quickAction(
    form,
    ["type", "title", "reason", "dueDate", "assigneeId"],
    taskForm,
    (id, data) => withTransactionalDb((db) => addTask(db, id, data)),
    "Próxima ação criada.",
  );
}

export async function addQuoteAction(_prev: FormState, form: FormData) {
  return quickAction(
    form,
    ["description", "total", "tireSize", "quantity", "validUntil"],
    quoteForm,
    (id, data) => withTransactionalDb((db) => addQuote(db, id, data)),
    "Orçamento registrado como enviado.",
  );
}

export async function addServiceAction(_prev: FormState, form: FormData) {
  const keys = ["type", "description", "date", "total", "km", "employeeId"];
  const { items, error } = parseServiceItems(form);
  if (error) return { values: formToObject(form, keys), errors: { items: error } };
  try {
    return await quickAction(
      form,
      keys,
      serviceForm,
      (id, data) => withTransactionalDb((db) => addService(db, id, { ...data, items })),
      items.length
        ? "Serviço registrado e estoque atualizado. O pós-venda foi agendado automaticamente."
        : "Serviço registrado. O pós-venda foi agendado automaticamente.",
    );
  } catch (err) {
    // Estoque insuficiente: nada foi gravado; o formulário mostra o motivo.
    if (err instanceof StockError) {
      return { values: formToObject(form, keys), errors: { items: err.message } };
    }
    throw err;
  }
}

export async function addAppointmentAction(_prev: FormState, form: FormData) {
  return quickAction(
    form,
    ["date", "time", "serviceType"],
    appointmentForm,
    (id, data) => withTransactionalDb((db) => addAppointment(db, id, data)),
    "Agendamento criado.",
  );
}

// ---------- Botões de 1 toque (Hoje e ficha) ----------

export async function completeTaskAction(taskId: string) {
  await requireSession();
  const customerId = await withTransactionalDb((db) => setTaskStatus(db, taskId, "concluida"));
  refresh(customerId);
}

export async function reopenTaskAction(taskId: string) {
  await requireSession();
  const customerId = await withTransactionalDb((db) => setTaskStatus(db, taskId, "pendente"));
  refresh(customerId);
}

export async function snoozeTaskAction(taskId: string, when: "amanha" | "3dias" | string) {
  await requireSession();
  const today = todayInStore();
  const due = when === "amanha" ? addDays(today, 1) : when === "3dias" ? addDays(today, 3) : when;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due) || due < today) throw new Error("Data inválida");
  const customerId = await withTransactionalDb((db) => snoozeTask(db, taskId, due));
  refresh(customerId);
  return due;
}

export async function setQuoteStatusAction(quoteId: string, status: "aprovado" | "recusado") {
  await requireSession();
  const customerId = await withTransactionalDb((db) => setQuoteStatus(db, quoteId, status));
  refresh(customerId);
}

export async function confirmAppointmentAction(appointmentId: string) {
  await requireSession();
  const customerId = await withTransactionalDb((db) =>
    setAppointmentStatus(db, appointmentId, "confirmado"),
  );
  refresh(customerId);
}
