// Regras dos formulários achadas no teste como usuário (AUDITORIA etapa 15): valor em reais como
// se escreve no Brasil, datas que só o servidor garante, veículo, oficina e "Editar e aprovar".
import { describe, expect, it } from "vitest";
import {
  appointmentFormAt,
  fieldErrors,
  newVehicleForm,
  parseMoneyBR,
  quoteFormAt,
  serviceFormAt,
  taskFormAt,
} from "@/lib/customers/input";
import { nextStage } from "@/lib/customers/stage";
import { employeeForm, newProductForm } from "@/lib/oficina/input";
import { editDefaults, EDIT_FIELDS, readEdits } from "@/lib/review/fields";

const TODAY = "2026-10-16";

describe("valor em reais", () => {
  it.each([
    ["1.840", 1840], // antes: R$ 1,84 sem aviso
    ["12.500", 12500],
    ["1.840,50", 1840.5],
    ["R$ 1.840,00", 1840],
    ["1840", 1840],
    ["1840,5", 1840.5],
    ["1840.50", 1840.5],
    ["0", 0],
  ])("%s → %s", (text, value) => {
    expect(parseMoneyBR(text)).toBe(value);
  });

  it.each(["", "abc", "1,840", "1.840.50", "-5", "1.84.0"])("%s não é um valor", (text) => {
    expect(parseMoneyBR(text)).toBeNaN();
  });
});

describe("datas que dependem de hoje (o servidor garante, não só o navegador)", () => {
  const task = { type: "outro", title: "Ligar", reason: "Pediu", assigneeId: "" };
  it("próxima ação: de hoje em diante", () => {
    expect(taskFormAt(TODAY).safeParse({ ...task, dueDate: TODAY }).success).toBe(true);
    const past = taskFormAt(TODAY).safeParse({ ...task, dueDate: "2026-10-01" });
    expect(past.success || fieldErrors(past.error)).toEqual({
      dueDate: "Escolha hoje ou uma data futura",
    });
  });

  it("data que não existe no calendário é recusada", () => {
    expect(taskFormAt(TODAY).safeParse({ ...task, dueDate: "2026-02-31" }).success).toBe(false);
  });

  it("serviço feito: hoje ou antes", () => {
    const service = {
      type: "troca_pneus",
      description: "Troca",
      total: "",
      km: "",
      employeeId: "",
    };
    expect(serviceFormAt(TODAY).safeParse({ ...service, date: "2026-10-10" }).success).toBe(true);
    const future = serviceFormAt(TODAY).safeParse({ ...service, date: "2026-12-25" });
    expect(future.success || fieldErrors(future.error)).toEqual({
      date: "Serviço feito não pode ter data futura",
    });
  });

  it("agendamento: dia e horário que ainda não passaram", () => {
    const at = (date: string, time: string) =>
      appointmentFormAt(TODAY, "10:30").safeParse({ date, time, serviceType: "alinhamento" });
    expect(at(TODAY, "16:00").success).toBe(true);
    expect(at("2026-10-17", "08:00").success).toBe(true);
    const yesterday = at("2026-10-15", "16:00");
    expect(yesterday.success || fieldErrors(yesterday.error)).toEqual({
      date: "Escolha hoje ou uma data futura",
    });
    const earlier = at(TODAY, "09:00");
    expect(earlier.success || fieldErrors(earlier.error)).toEqual({
      time: "Esse horário de hoje já passou",
    });
    expect(at(TODAY, "25:00").success).toBe(false);
  });

  it("orçamento: validade, se informada, de hoje em diante", () => {
    const quote = { description: "4 pneus", total: "1.840", tireSize: "", quantity: "4" };
    expect(quoteFormAt(TODAY).safeParse({ ...quote, validUntil: "" }).success).toBe(true);
    expect(quoteFormAt(TODAY).safeParse({ ...quote, validUntil: "2026-10-01" }).success).toBe(
      false,
    );
    const parsed = quoteFormAt(TODAY).parse({ ...quote, validUntil: "2026-10-30" });
    expect(parsed.total).toBe(1840);
  });
});

describe("veículo novo na ficha", () => {
  it("precisa de modelo, placa ou medida; ano plausível", () => {
    const empty = newVehicleForm.safeParse({
      vehicleModel: "",
      vehiclePlate: "",
      vehicleTire: "",
      vehicleYear: "",
    });
    expect(empty.success).toBe(false);
    expect(
      newVehicleForm.safeParse({
        vehicleModel: "Onix",
        vehiclePlate: "",
        vehicleTire: "",
        vehicleYear: "1800",
      }).success,
    ).toBe(false);
    expect(
      newVehicleForm.parse({
        vehicleModel: "Onix",
        vehiclePlate: "",
        vehicleTire: "",
        vehicleYear: "2020",
      }),
    ).toMatchObject({ vehicleModel: "Onix", vehicleYear: 2020 });
  });
});

describe("oficina", () => {
  const product = { name: "Pneu X", price: "460", minQuantity: "2", quantity: "4", active: "on" };
  it("pneu precisa de medida; outro item não", () => {
    const tire = newProductForm.safeParse({ ...product, kind: "pneu", tireSize: "" });
    expect(tire.success || fieldErrors(tire.error)).toEqual({
      tireSize: "Informe a medida do pneu, ex.: 205/55 R16",
    });
    expect(newProductForm.safeParse({ ...product, kind: "item", tireSize: "" }).success).toBe(true);
  });

  it("telefone do funcionário: validado e guardado no formato da ficha", () => {
    const base = { name: "Joana", role: "Borracheira", active: "on" };
    expect(employeeForm.safeParse({ ...base, phoneDisplay: "abc" }).success).toBe(false);
    expect(employeeForm.parse({ ...base, phoneDisplay: "19988776655" }).phoneDisplay).toBe(
      "(19) 98877-6655",
    );
    expect(employeeForm.parse({ ...base, phoneDisplay: "" }).phoneDisplay).toBeUndefined();
  });
});

describe("etapa do funil acompanha os fatos", () => {
  it.each([
    ["novo_contato", "orcamento_enviado", "orcamento_enviado"],
    ["orcamento_enviado", "cliente", "cliente"],
    ["cliente", "orcamento_enviado", null], // quem já comprou continua cliente
    ["agendado", "orcamento_enviado", null],
    ["perdido", "orcamento_enviado", "orcamento_enviado"], // voltou a pedir orçamento
    ["cliente", "cliente", null],
  ] as const)("%s + fato de %s → %s", (current, target, expected) => {
    expect(nextStage(current, target)).toBe(expected);
  });
});

describe("Editar e aprovar (Revisão)", () => {
  const form = (entries: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(entries)) f.set(`data.${k}`, v);
    return f;
  };

  it("valor como se escreve no Brasil; só entra o que mudou", () => {
    const original = { description: "2 pneus", total: 898, quantity: 2 };
    expect(
      readEdits(
        "quote.created",
        original,
        form({ description: "2 pneus", total: "1.840", quantity: "2" }),
      ),
    ).toEqual({ edited: { total: 1840 }, errors: [] });
    expect(readEdits("quote.created", original, form({ total: "abc" })).errors).toEqual([
      "Valor (R$) (use o formato 1.840,00)",
    ]);
  });

  it("dia e horário no relógio da loja viram o instante do contrato", () => {
    const original = { scheduled_at: "2026-10-20T09:00:00-03:00", service_type: "alinhamento" };
    const field = EDIT_FIELDS["appointment.requested"][0];
    expect(editDefaults(field, original.scheduled_at)).toEqual({
      scheduled_at__date: "2026-10-20",
      scheduled_at__time: "09:00",
    });
    const unchanged = form({
      scheduled_at__date: "2026-10-20",
      scheduled_at__time: "09:00",
      service_type: "alinhamento",
    });
    expect(readEdits("appointment.requested", original, unchanged).edited).toEqual({});
    const moved = form({
      scheduled_at__date: "2026-10-21",
      scheduled_at__time: "10:30",
      service_type: "balanceamento",
    });
    expect(readEdits("appointment.requested", original, moved).edited).toEqual({
      scheduled_at: "2026-10-21T13:30:00.000Z",
      service_type: "balanceamento",
    });
  });

  it("campo obrigatório vazio é apontado; opcional vazio sai do evento", () => {
    const original = {
      description: "Troca",
      type: "troca_pneus",
      performed_at: "2026-10-16T15:00:00Z",
      total: 100,
    };
    const r = readEdits(
      "service.completed",
      original,
      form({
        description: "",
        type: "troca_pneus",
        performed_at__date: "2026-10-16",
        performed_at__time: "12:00",
        total: "",
      }),
    );
    expect(r.errors).toEqual(["Descrição"]);
    expect("total" in r.edited && r.edited.total === undefined).toBe(true);
  });
});
