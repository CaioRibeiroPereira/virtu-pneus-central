// Validação dos formulários da oficina (D58), no mesmo estilo dos da ficha.
import { z } from "zod";
import { money, optional, optionalInt, required, SERVICE_TYPES } from "@/lib/customers/input";

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

export const productForm = z.object({
  kind: z.enum(["pneu", "item"]),
  name: required(120),
  tireSize: optional(30),
  price: money,
  minQuantity: int(0, 10_000, "o estoque mínimo"),
  active: checkbox,
});
export const newProductForm = productForm.extend({ quantity: int(0, 100_000, "a quantidade") });

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

export const employeeForm = z.object({
  name: required(120),
  role: required(60),
  phoneDisplay: optional(40),
  active: checkbox,
});
