// "Editar e aprovar" na Revisão (D60): o que o gestor pode corrigir em cada tipo de sugestão, com o
// campo certo — data, dia e hora no relógio da loja, valor em reais, lista de opções. Antes ele
// via e digitava o formato da máquina ("2026-10-20T09:00:00-03:00", "pos_venda") e o erro vinha
// em inglês. Sem zod: a tela (cliente) e a ação (servidor) usam a mesma descrição.
import { formatTime, storeDateOf, storeTimeToUtc } from "@/lib/dates";
import { parseMoneyBR } from "@/lib/money";
import { channelLabel, options, originLabel, serviceTypeLabel, taskTypeLabel } from "@/lib/labels";

export type EditKind = "text" | "email" | "money" | "int" | "date" | "datetime" | "select";
export type EditField = {
  key: string;
  label: string;
  kind: EditKind;
  options?: [string, string][];
  required?: boolean;
};

const QUOTE_DECISION: [string, string][] = [
  ["aprovado", "Aprovado"],
  ["recusado", "Recusado"],
];

export const EDIT_FIELDS: Record<string, EditField[]> = {
  "customer.upserted": [
    { key: "name", label: "Nome", kind: "text" },
    { key: "email", label: "E-mail", kind: "email" },
    { key: "city", label: "Cidade", kind: "text" },
    { key: "origin", label: "Origem", kind: "select", options: options(originLabel) },
  ],
  "vehicle.identified": [
    { key: "model", label: "Modelo", kind: "text" },
    { key: "plate", label: "Placa", kind: "text" },
    { key: "year", label: "Ano", kind: "int" },
    { key: "tire_size", label: "Medida do pneu", kind: "text" },
  ],
  "interaction.logged": [
    { key: "summary", label: "Resumo", kind: "text", required: true },
    {
      key: "channel",
      label: "Canal",
      kind: "select",
      options: options(channelLabel),
      required: true,
    },
  ],
  "quote.created": [
    { key: "description", label: "Descrição", kind: "text", required: true },
    { key: "total", label: "Valor (R$)", kind: "money", required: true },
    { key: "tire_size", label: "Medida do pneu", kind: "text" },
    { key: "quantity", label: "Quantidade", kind: "int" },
    { key: "valid_until", label: "Válido até", kind: "date" },
    { key: "vehicle_plate", label: "Placa", kind: "text" },
  ],
  "task.suggested": [
    { key: "title", label: "O que fazer", kind: "text", required: true },
    { key: "reason", label: "Por quê", kind: "text", required: true },
    { key: "due_date", label: "Quando", kind: "date", required: true },
    {
      key: "type",
      label: "Tipo",
      kind: "select",
      options: options(taskTypeLabel),
      required: true,
    },
  ],
  "appointment.requested": [
    { key: "scheduled_at", label: "Dia e horário", kind: "datetime", required: true },
    {
      key: "service_type",
      label: "Serviço",
      kind: "select",
      options: options(serviceTypeLabel),
      required: true,
    },
  ],
  "quote.status_changed": [
    { key: "status", label: "Decisão", kind: "select", options: QUOTE_DECISION, required: true },
    { key: "reason", label: "Motivo", kind: "text" },
  ],
  "service.completed": [
    {
      key: "type",
      label: "Serviço",
      kind: "select",
      options: options(serviceTypeLabel),
      required: true,
    },
    { key: "description", label: "Descrição", kind: "text", required: true },
    { key: "performed_at", label: "Dia e horário", kind: "datetime", required: true },
    { key: "total", label: "Valor (R$)", kind: "money" },
    { key: "km", label: "Quilometragem", kind: "int" },
  ],
};

const brl = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2 });

/** Valor inicial do campo na tela (formato de gente). Datetime vira dia + hora da loja. */
export function editDefaults(field: EditField, value: unknown): Record<string, string> {
  if (value === undefined || value === null || value === "") {
    return field.kind === "datetime"
      ? { [`${field.key}__date`]: "", [`${field.key}__time`]: "" }
      : { [field.key]: "" };
  }
  if (field.kind === "datetime") {
    const at = new Date(String(value));
    return { [`${field.key}__date`]: storeDateOf(at), [`${field.key}__time`]: formatTime(at) };
  }
  if (field.kind === "money" && typeof value === "number") return { [field.key]: brl(value) };
  return { [field.key]: String(value) };
}

/**
 * Lê o formulário (campos "data.<campo>") e devolve só o que mudou, já no formato do contrato
 * (§8.2). `errors`: rótulos dos campos que não dá para entender (ex.: valor "abc").
 */
export function readEdits(
  type: string,
  original: Record<string, unknown>,
  form: FormData,
): { edited: Record<string, unknown>; errors: string[] } {
  const edited: Record<string, unknown> = {};
  const errors: string[] = [];
  const get = (name: string) => String(form.get(`data.${name}`) ?? "").trim();

  for (const field of EDIT_FIELDS[type] ?? []) {
    let value: unknown;
    if (field.kind === "datetime") {
      const day = get(`${field.key}__date`);
      const time = get(`${field.key}__time`);
      if (!form.has(`data.${field.key}__date`)) continue; // campo não veio: nada a mudar
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{2}:\d{2}$/.test(time)) {
        errors.push(field.label);
        continue;
      }
      value = storeTimeToUtc(day, time).toISOString();
      const before = original[field.key];
      if (before && new Date(String(before)).getTime() === new Date(String(value)).getTime()) {
        continue;
      }
    } else {
      if (!form.has(`data.${field.key}`)) continue;
      const raw = get(field.key);
      if (raw === "") {
        if (field.required) errors.push(field.label);
        else if (original[field.key] !== undefined) edited[field.key] = undefined;
        continue;
      }
      if (field.kind === "money") {
        value = parseMoneyBR(raw);
        if (Number.isNaN(value)) {
          errors.push(`${field.label} (use o formato 1.840,00)`);
          continue;
        }
      } else if (field.kind === "int") {
        if (!/^\d+$/.test(raw)) {
          errors.push(field.label);
          continue;
        }
        value = Number(raw);
      } else {
        value = raw;
      }
      if (String(value) === String(original[field.key] ?? "")) continue;
    }
    edited[field.key] = value;
  }
  return { edited, errors };
}

/** Rótulo de um campo do contrato, para mensagens ("total" → "Valor (R$)"). */
export function editLabel(type: string, key: string): string {
  return EDIT_FIELDS[type]?.find((f) => f.key === key)?.label ?? key;
}
