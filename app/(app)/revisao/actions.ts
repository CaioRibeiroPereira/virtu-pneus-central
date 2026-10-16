"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, withTransactionalDb } from "@/db";
import { agentEvents, reviewItems } from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import { parseServiceItems } from "@/lib/customers/input";
import { approveReview, rejectReview } from "@/lib/review/commands";
import { readEdits } from "@/lib/review/fields";

export type ReviewFormState = { ok?: boolean; message?: string; error?: string };

function refresh(customerId?: string | null) {
  revalidatePath("/revisao");
  revalidatePath("/hoje");
  revalidatePath("/clientes");
  if (customerId) revalidatePath(`/clientes/${customerId}`);
}

/** Valores corrigidos ("Editar e aprovar"): só entram os que mudaram, no formato do contrato. */
async function editedFields(reviewId: string, form: FormData) {
  const [row] = await getDb()
    .select({ payload: agentEvents.payload })
    .from(reviewItems)
    .innerJoin(agentEvents, eq(agentEvents.id, reviewItems.agentEventId))
    .where(eq(reviewItems.id, reviewId));
  const payload = (row?.payload ?? {}) as { type?: string; data?: Record<string, unknown> };
  return readEdits(payload.type ?? "", payload.data ?? {}, form);
}

export async function approveReviewAction(
  _prev: ReviewFormState,
  form: FormData,
): Promise<ReviewFormState> {
  await requireSession();
  const reviewId = String(form.get("reviewId") ?? "");
  const choice = String(form.get("customerChoice") ?? "");
  const edits = form.get("mode") === "editar" ? await editedFields(reviewId, form) : null;
  if (edits?.errors.length) return { error: `Confira: ${edits.errors.join(", ")}.` };
  const options = {
    editedData: edits?.edited,
    customerId: choice.startsWith("existing:") ? choice.slice(9) : undefined,
    createCustomerName:
      choice === "new" ? String(form.get("newCustomerName") ?? "").trim() || undefined : undefined,
    note: String(form.get("note") ?? "").trim() || undefined,
  };
  if (choice === "new" && !options.createCustomerName) {
    return { error: "Informe o nome do novo cliente." };
  }
  // "Serviço feito": itens do estoque confirmados pelo gestor (mesmos campos da ficha — D59).
  const { items: stockItems, error: itemsError } = parseServiceItems(form);
  if (itemsError) return { error: itemsError };
  const result = await withTransactionalDb((db) =>
    approveReview(db, reviewId, { ...options, stockItems }),
  );
  if (!result.ok) return { error: result.message };
  refresh(result.customerId);
  return { ok: true, message: "Sugestão aprovada e aplicada." };
}

export async function rejectReviewAction(
  _prev: ReviewFormState,
  form: FormData,
): Promise<ReviewFormState> {
  await requireSession();
  const reviewId = String(form.get("reviewId") ?? "");
  const note = String(form.get("note") ?? "").trim() || undefined;
  const result = await withTransactionalDb((db) => rejectReview(db, reviewId, note));
  if (!result.ok) return { error: result.message };
  refresh(result.customerId);
  return { ok: true, message: "Sugestão rejeitada. Nada foi alterado." };
}
