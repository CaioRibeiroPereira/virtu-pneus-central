// Validação dos formulários da oficina (D58), no mesmo estilo dos da ficha.
import { z } from "zod";
import { money, optional, optionalInt, required, SERVICE_TYPES } from "@/lib/customers/input";
import { normalizePhone } from "@/lib/phone";

const int = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .transform((v) => (v === "" ? NaN : Number(v)))
    .pipe(
      z
        .number({ error: `Informe ${label}` })
        .int(`Use um número inteiro`)
        .min(min, `Mínimo ${min}`)
        .max(max, `Máximo ${max}`),
    );
/** Checkbox de formulário: marcado = "on". */
const checkbox = z
  .string()
  .optional()
  .transform((v) => v === "on");

const productBase = z.object({
  kind: z.enum(["pneu", "item"]),
  name: required(120),
  tireSize: optional(30),
  price: money,
  minQuantity: int(0, 10_000, "o estoque mínimo"),
  active: checkbox,
});
/** Pneu sem medida não serve para a sugestão de baixa nem para o orçamento (D60). */
const tireNeedsSize = (v: { kind: string; tireSize?: string }, ctx: z.RefinementCtx) => {
  if (v.kind === "pneu" && !v.tireSize) {
    ctx.addIssue({
      code: "custom",
      path: ["tireSize"],
      message: "Informe a medida do pneu, ex.: 205/55 R16",
    });
  }
};
export const productForm = productBase.superRefine(tireNeedsSize);
export const newProductForm = productBase
  .extend({ quantity: int(0, 100_000, "a quantidade") })
  .superRefine(tireNeedsSize);

export const entryForm = z.object({
  quantity: int(1, 100_000, "a quantidade"),
  note: optional(200),
});

export const adjustForm = z.object({
  counted: int(0, 100_000, "a quantidade contada"),
  note: required(200, "Diga o motivo do ajuste"),
});

export const catalogForm = z.object({
  name: required(120),
  type: z.enum(SERVICE_TYPES),
  price: money,
  durationMinutes: optionalInt(1440),
  active: checkbox,
});

export const employeeForm = z
  .object({
    name: required(120),
    role: required(60),
    phoneDisplay: optional(40),
    active: checkbox,
  })
  .superRefine((v, ctx) => {
    if (v.phoneDisplay && !normalizePhone(v.phoneDisplay)) {
      ctx.addIssue({
        code: "custom",
        path: ["phoneDisplay"],
        message: "Telefone inválido. Inclua o DDD, ex.: (19) 98888-7777",
      });
    }
  })
  // Guarda no mesmo formato dos clientes: "(19) 98888-7777".
  .transform((v) => ({
    ...v,
    phoneDisplay: v.phoneDisplay ? normalizePhone(v.phoneDisplay)?.display : undefined,
  }));
