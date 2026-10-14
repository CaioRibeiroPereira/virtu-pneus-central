// Validação dos formulários do gestor (os valores chegam como texto do FormData).
import { z } from "zod";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const required = (max: number, message = "Campo obrigatório") =>
  z.string().trim().min(1, message).max(max, `Use no máximo ${max} caracteres`);
const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use no máximo ${max} caracteres`)
    .transform((v) => v || undefined)
    .optional();

/** Aceita "1840", "1840,50", "1.840,50", "R$ 1.840,50" e "1840.50". */
export function parseMoneyBR(value: string): number {
  const clean = value.replace(/R\$|\s/g, "");
  const normalized = clean.includes(",") ? clean.replace(/\./g, "").replace(",", ".") : clean;
  return normalized === "" ? NaN : Number(normalized);
}

const money = z
  .string()
  .transform(parseMoneyBR)
  .pipe(z.number({ error: "Informe um valor, ex.: 1.840,00" }).nonnegative().max(1_000_000));
const optionalMoney = z
  .string()
  .transform((v) => (v.trim() ? parseMoneyBR(v) : undefined))
  .pipe(z.number({ error: "Valor inválido" }).nonnegative().max(1_000_000).optional());
const optionalInt = (max: number) =>
  z
    .string()
    .transform((v) => (v.trim() ? Number(v) : undefined))
    .pipe(z.number({ error: "Número inválido" }).int().nonnegative().max(max).optional());
const date = z.string().regex(DATE_ONLY, "Escolha uma data");

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

export const taskForm = z.object({
  type: z.enum(TASK_TYPES),
  title: required(120),
  reason: required(300),
  dueDate: date,
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
});

export const appointmentForm = z.object({
  date,
  time: z.string().regex(/^\d{2}:\d{2}$/, "Escolha um horário"),
  serviceType: z.enum(SERVICE_TYPES),
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
