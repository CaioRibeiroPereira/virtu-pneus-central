// Validação dos formulários do gestor (os valores chegam como texto do FormData).
import { z } from "zod";
import { parseMoneyBR } from "@/lib/money";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
export const required = (max: number, message = "Campo obrigatório") =>
  z.string().trim().min(1, message).max(max, `Use no máximo ${max} caracteres`);
export const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use no máximo ${max} caracteres`)
    .transform((v) => v || undefined)
    .optional();

export { parseMoneyBR };

export const money = z
  .string()
  .transform(parseMoneyBR)
  .pipe(z.number({ error: "Informe um valor, ex.: 1.840,00" }).nonnegative().max(1_000_000));
export const optionalMoney = z
  .string()
  .transform((v) => (v.trim() ? parseMoneyBR(v) : undefined))
  .pipe(z.number({ error: "Valor inválido" }).nonnegative().max(1_000_000).optional());
export const optionalInt = (max: number) =>
  z
    .string()
    .transform((v) => (v.trim() ? Number(v) : undefined))
    .pipe(z.number({ error: "Número inválido" }).int().nonnegative().max(max).optional());
/** "2026-02-31" passa na expressão, mas não existe no calendário. */
const isRealDate = (v: string) => {
  const [y, m, d] = v.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10) === v;
};
const date = z.string().regex(DATE_ONLY, "Escolha uma data").refine(isRealDate, "Escolha uma data");
/** Select opcional de cadastro (funcionário, produto): "" = nenhum. */
export const optionalId = z
  .string()
  .transform((v) => v || undefined)
  .pipe(z.uuid({ error: "Escolha da lista" }).optional());

export const ORIGINS = ["whatsapp", "indicacao", "balcao", "instagram", "google", "outro"] as const;
export const STAGES = [
  "novo_contato",
  "em_negociacao",
  "orcamento_enviado",
  "agendado",
  "cliente",
  "perdido",
] as const;
export const SERVICE_TYPES = [
  "troca_pneus",
  "alinhamento",
  "balanceamento",
  "rodizio",
  "reparo",
  "outro",
] as const;
export const TASK_TYPES = [
  "retorno_comercial",
  "followup_orcamento",
  "pos_venda",
  "confirmar_agendamento",
  "outro",
] as const;

export const customerForm = z
  .object({
    name: required(120, "Informe o nome"),
    phone: required(40, "Informe o telefone"),
    email: z
      .string()
      .trim()
      .transform((v) => v || undefined)
      .pipe(z.email("E-mail inválido").optional()),
    city: optional(80),
    origin: z.enum(ORIGINS),
    stage: z.enum(STAGES),
    lossReason: optional(300),
    notes: optional(2000),
  })
  .refine((v) => v.stage !== "perdido" || !!v.lossReason, {
    path: ["lossReason"],
    message: "Informe o motivo da perda",
  });
export type CustomerFormData = z.infer<typeof customerForm>;

export const vehicleForm = z.object({
  vehicleModel: optional(80),
  vehiclePlate: optional(10),
  vehicleTire: optional(30),
});

/** Veículo novo na ficha (D60): ao menos modelo, placa ou medida — senão não há o que guardar. */
export const newVehicleForm = vehicleForm
  .extend({
    vehicleYear: z
      .string()
      .transform((v) => (v.trim() ? Number(v) : undefined))
      .pipe(
        z
          .number({ error: "Ano inválido" })
          .int("Ano inválido")
          .min(1950, "Ano inválido")
          .max(new Date().getFullYear() + 1, "Ano inválido")
          .optional(),
      ),
  })
  .refine((v) => v.vehicleModel || v.vehiclePlate || v.vehicleTire, {
    path: ["vehicleModel"],
    message: "Informe ao menos o modelo, a placa ou a medida do pneu",
  });

/** Atendimento registrado pelo gestor (ligação, balcão, WhatsApp fora do Vito). */
export const interactionForm = z.object({
  channel: z.enum(["whatsapp", "telefone", "balcao", "telegram"]),
  summary: required(1000, "Escreva o que foi conversado"),
});

export const taskForm = z.object({
  type: z.enum(TASK_TYPES),
  title: required(120),
  reason: required(300),
  dueDate: date,
  assigneeId: optionalId,
});

export const quoteForm = z.object({
  description: required(500),
  total: money,
  tireSize: optional(30),
  quantity: optionalInt(100),
  validUntil: z
    .string()
    .transform((v) => v || undefined)
    .pipe(date.optional()),
});

export const serviceForm = z.object({
  type: z.enum(SERVICE_TYPES),
  description: required(500),
  date,
  total: optionalMoney,
  km: optionalInt(5_000_000),
  employeeId: optionalId,
});

/** Linhas "Itens do estoque" do formulário de serviço (item_product_N + item_qty_N). */
export const SERVICE_ITEM_ROWS = 3;
export function parseServiceItems(form: FormData): {
  items: { productId: string; quantity: number }[];
  error?: string;
} {
  const items: { productId: string; quantity: number }[] = [];
  for (let i = 1; i <= SERVICE_ITEM_ROWS; i++) {
    const productId = String(form.get(`item_product_${i}`) ?? "");
    const qty = String(form.get(`item_qty_${i}`) ?? "").trim();
    if (!productId) continue;
    const quantity = Number(qty || "1");
    if (!z.uuid().safeParse(productId).success)
      return { items, error: "Escolha o produto da lista." };
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
      return { items, error: "Quantidade do item: um número inteiro de 1 a 100." };
    }
    items.push({ productId, quantity });
  }
  return { items };
}

export const appointmentForm = z.object({
  date,
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Escolha um horário"),
  serviceType: z.enum(SERVICE_TYPES),
});

// ---------- Datas que dependem de "hoje" ----------
// O navegador sugere (min/max no campo), mas quem digita a data ou envia o formulário de outro
// jeito passa por cima. A regra vale aqui, no servidor: nada nasce atrasado nem no futuro errado.

const FUTURE_OR_TODAY = "Escolha hoje ou uma data futura";

/** Próxima ação: prazo de hoje em diante. */
export const taskFormAt = (today: string) =>
  taskForm.refine((v) => v.dueDate >= today, { path: ["dueDate"], message: FUTURE_OR_TODAY });

/** Orçamento: validade de hoje em diante (se informada). */
export const quoteFormAt = (today: string) =>
  quoteForm.refine((v) => !v.validUntil || v.validUntil >= today, {
    path: ["validUntil"],
    message: FUTURE_OR_TODAY,
  });

/** Serviço feito: hoje ou antes. */
export const serviceFormAt = (today: string) =>
  serviceForm.refine((v) => v.date <= today, {
    path: ["date"],
    message: "Serviço feito não pode ter data futura",
  });

/** Agendamento: dia e horário que ainda não passaram (relógio da loja). */
export const appointmentFormAt = (today: string, nowTime: string) =>
  appointmentForm.superRefine((v, ctx) => {
    if (v.date < today) ctx.addIssue({ code: "custom", path: ["date"], message: FUTURE_OR_TODAY });
    else if (v.date === today && v.time < nowTime) {
      ctx.addIssue({ code: "custom", path: ["time"], message: "Esse horário de hoje já passou" });
    }
  });

/** Transforma os erros do zod em { campo: mensagem } para mostrar ao lado de cada campo. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}

/** FormData → objeto de strings (campos ausentes viram ""). */
export function formToObject(form: FormData, keys: readonly string[]): Record<string, string> {
  return Object.fromEntries(keys.map((k) => [k, String(form.get(k) ?? "")]));
}
