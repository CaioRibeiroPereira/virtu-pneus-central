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
  addInteraction,
  addQuote,
  addService,
  addTask,
  addVehicle,
  CommandError,
  createCustomer,
  setAppointmentStatus,
  setQuoteStatus,
  setTaskStatus,
  snoozeTask,
} from "@/lib/customers/commands";
import {
  appointmentFormAt,
  customerForm,
  fieldErrors,
  formToObject,
  interactionForm,
  newVehicleForm,
  parseServiceItems,
  quoteForm,
  quoteFormAt,
  serviceFormAt,
  taskFormAt,
  vehicleForm,
} from "@/lib/customers/input";
import { updateCustomerByGestor } from "@/lib/customers/update";
import { deleteQuote, deleteService, updateQuote, updateService } from "@/lib/customers/records";
import { eraseCustomer } from "@/lib/customers/erase";
import { customers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { addDays, formatTime, todayInStore } from "@/lib/dates";
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
  try {
    await run(customerId, parsed.data);
  } catch (err) {
    // Regra recusada (estoque insuficiente, placa repetida…): nada foi gravado e o formulário
    // mostra o motivo, com o que foi digitado.
    if (err instanceof StockError) return { values, errors: { items: err.message } };
    if (err instanceof CommandError)
      return { values, errors: { [err.field ?? "_form"]: err.message } };
    throw err;
  }
  refresh(customerId);
  return { ok: true, message: successMessage };
}

export async function addInteractionAction(_prev: FormState, form: FormData) {
  return quickAction(
    form,
    ["channel", "summary"],
    interactionForm,
    (id, data) => withTransactionalDb((db) => addInteraction(db, id, data)),
    "Atendimento registrado no histórico.",
  );
}

export async function addTaskAction(_prev: FormState, form: FormData) {
  return quickAction(
    form,
    ["type", "title", "reason", "dueDate", "assigneeId"],
    taskFormAt(todayInStore()),
    (id, data) => withTransactionalDb((db) => addTask(db, id, data)),
    "Próxima ação criada.",
  );
}

export async function addQuoteAction(_prev: FormState, form: FormData) {
  return quickAction(
    form,
    ["description", "total", "tireSize", "quantity", "validUntil"],
    quoteFormAt(todayInStore()),
    (id, data) => withTransactionalDb((db) => addQuote(db, id, data)),
    "Orçamento registrado como enviado.",
  );
}

export async function addServiceAction(_prev: FormState, form: FormData) {
  const keys = ["type", "description", "date", "total", "km", "employeeId"];
  const { items, error } = parseServiceItems(form);
  if (error) return { values: formToObject(form, keys), errors: { items: error } };
  return quickAction(
    form,
    keys,
    serviceFormAt(todayInStore()),
    (id, data) => withTransactionalDb((db) => addService(db, id, { ...data, items })),
    items.length
      ? "Serviço registrado e estoque atualizado. O pós-venda foi agendado automaticamente."
      : "Serviço registrado. O pós-venda foi agendado automaticamente.",
  );
}

export async function addAppointmentAction(_prev: FormState, form: FormData) {
  const now = new Date();
  return quickAction(
    form,
    ["date", "time", "serviceType"],
    appointmentFormAt(todayInStore(now), formatTime(now)),
    (id, data) => withTransactionalDb((db) => addAppointment(db, id, data)),
    "Agendamento criado.",
  );
}

export async function addVehicleAction(_prev: FormState, form: FormData) {
  return quickAction(
    form,
    ["vehicleModel", "vehiclePlate", "vehicleTire", "vehicleYear"],
    newVehicleForm,
    (id, data) => withTransactionalDb((db) => addVehicle(db, id, data)),
    "Veículo cadastrado.",
  );
}

// ---------- Botões de 1 toque (Hoje e ficha) ----------
// Devolvem o resultado em vez de lançar erro: uma recusa (ex.: a ação já foi concluída em outra
// aba) vira um aviso na tela, e não a página de erro.

export type TapResult = { ok: true; message?: string } | { ok: false; message: string };

async function tap(run: () => Promise<string | undefined | void>): Promise<TapResult> {
  await requireSession();
  try {
    return { ok: true, message: (await run()) ?? undefined };
  } catch (err) {
    if (err instanceof CommandError) return { ok: false, message: err.message };
    throw err;
  }
}

export async function completeTaskAction(taskId: string) {
  return tap(async () => {
    const r = await withTransactionalDb((db) => setTaskStatus(db, taskId, "concluida"));
    refresh(r.customerId);
    return r.note;
  });
}

export async function reopenTaskAction(taskId: string) {
  return tap(async () => {
    const r = await withTransactionalDb((db) => setTaskStatus(db, taskId, "pendente"));
    refresh(r.customerId);
  });
}

export async function snoozeTaskAction(taskId: string, when: "amanha" | "3dias" | string) {
  return tap(async () => {
    const today = todayInStore();
    const due = when === "amanha" ? addDays(today, 1) : when === "3dias" ? addDays(today, 3) : when;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(due) || due < today) {
      throw new CommandError("Escolha hoje ou uma data futura para adiar.");
    }
    const customerId = await withTransactionalDb((db) => snoozeTask(db, taskId, due));
    refresh(customerId);
    return due;
  });
}

export async function setQuoteStatusAction(
  quoteId: string,
  status: "aprovado" | "recusado",
  reason?: string,
) {
  return tap(async () => {
    const why = reason?.trim().slice(0, 300) || undefined;
    const customerId = await withTransactionalDb((db) => setQuoteStatus(db, quoteId, status, why));
    refresh(customerId);
  });
}

export async function confirmAppointmentAction(appointmentId: string) {
  return tap(async () => {
    const customerId = await withTransactionalDb((db) =>
      setAppointmentStatus(db, appointmentId, "confirmado"),
    );
    refresh(customerId);
  });
}

export async function cancelAppointmentAction(appointmentId: string) {
  return tap(async () => {
    const customerId = await withTransactionalDb((db) =>
      setAppointmentStatus(db, appointmentId, "cancelado"),
    );
    refresh(customerId);
  });
}

// ---------- Corrigir e excluir registros (D64) ----------

export async function updateQuoteAction(_prev: FormState, form: FormData): Promise<FormState> {
  await requireSession();
  const quoteId = String(form.get("quoteId") ?? "");
  const keys = ["description", "total", "tireSize", "quantity", "validUntil"];
  const values = formToObject(form, keys);
  const parsed = quoteForm.safeParse(values);
  if (!parsed.success) return { values, errors: fieldErrors(parsed.error) };
  try {
    const customerId = await withTransactionalDb((db) => updateQuote(db, quoteId, parsed.data));
    refresh(customerId);
  } catch (err) {
    if (err instanceof CommandError) return { values, errors: { _form: err.message } };
    throw err;
  }
  return { ok: true, message: "Orçamento corrigido." };
}

export async function deleteQuoteAction(quoteId: string) {
  return tap(async () => {
    const customerId = await withTransactionalDb((db) => deleteQuote(db, quoteId));
    refresh(customerId);
    return "Orçamento excluído.";
  });
}

export async function updateServiceAction(_prev: FormState, form: FormData): Promise<FormState> {
  await requireSession();
  const serviceId = String(form.get("serviceId") ?? "");
  const keys = ["type", "description", "date", "total", "km", "employeeId"];
  const values = formToObject(form, keys);
  const parsed = serviceFormAt(todayInStore()).safeParse(values);
  if (!parsed.success) return { values, errors: fieldErrors(parsed.error) };
  try {
    const customerId = await withTransactionalDb((db) => updateService(db, serviceId, parsed.data));
    refresh(customerId);
  } catch (err) {
    if (err instanceof CommandError) return { values, errors: { _form: err.message } };
    throw err;
  }
  return { ok: true, message: "Serviço corrigido." };
}

export async function deleteServiceAction(serviceId: string) {
  return tap(async () => {
    const r = await withTransactionalDb((db) => deleteService(db, serviceId));
    refresh(r.customerId);
    revalidatePath("/estoque");
    return r.returnedItems
      ? "Serviço excluído. Os itens que ele tinha baixado voltaram ao estoque."
      : "Serviço excluído.";
  });
}

/** Exclusão a pedido do titular (LGPD): só com o nome digitado igual ao do cadastro. */
export async function deleteCustomerAction(_prev: FormState, form: FormData): Promise<FormState> {
  await requireSession();
  const id = String(form.get("id") ?? "");
  const typed = String(form.get("confirmName") ?? "").trim();
  const [customer] = await withTransactionalDb((db) =>
    db.select({ name: customers.name }).from(customers).where(eq(customers.id, id)),
  );
  if (!customer) return { message: "Cliente não encontrado." };
  if (typed.toLocaleLowerCase("pt-BR") !== customer.name.trim().toLocaleLowerCase("pt-BR")) {
    return {
      values: { confirmName: typed },
      errors: { confirmName: "Digite o nome exatamente como está no cadastro" },
    };
  }
  await withTransactionalDb((db) => eraseCustomer(db, id));
  revalidatePath("/", "layout");
  redirect("/clientes?excluido=1");
}
