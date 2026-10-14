import { describe, expect, it } from "vitest";
import { agentEventSchema, HIGH_RISK_TYPES } from "@/lib/agent/schema";
import { diffCustomerFields } from "@/lib/agent/apply";
import { thresholdFromEnv } from "@/lib/agent/handler";
import { computeAutoTasks, staleAutoTasks } from "@/lib/rules/auto-tasks";
import { assembleToday, type TodayTask } from "@/lib/rules/today";
import { storeTimeToUtc } from "@/lib/dates";

const base = {
  schema_version: "1.0",
  event_id: "evento-0001",
  occurred_at: "2026-10-14T13:05:00-03:00",
  source: { channel: "whatsapp", conversation_id: "c1", message_ids: ["m1"] },
  agent: { name: "vito", model: "gemini", prompt_version: "1" },
  confidence: 0.9,
  customer: { phone: "(19) 98888-7777" },
};

describe("contrato dos eventos (§8)", () => {
  it.each([
    ["customer.upserted", { name: "Ana", email: "ana@example.com", origin: "whatsapp" }],
    [
      "vehicle.identified",
      { plate: "ABC1D23", model: "Onix", year: 2020, tire_size: "185/65 R15" },
    ],
    ["interaction.logged", { summary: "Pediu preço", channel: "whatsapp" }],
    [
      "quote.created",
      { description: "4 pneus", total: 1840, quantity: 4, valid_until: "2026-10-20" },
    ],
    [
      "task.suggested",
      { type: "pos_venda", title: "Ligar", reason: "Pós-venda", due_date: "2026-10-15" },
    ],
    [
      "appointment.requested",
      { scheduled_at: "2026-10-17T09:00:00-03:00", service_type: "alinhamento" },
    ],
    ["quote.status_changed", { status: "aprovado" }],
    [
      "service.completed",
      { type: "troca_pneus", description: "Troca", performed_at: "2026-10-14T15:00:00-03:00" },
    ],
  ])("aceita %s válido", (type, data) => {
    expect(agentEventSchema.safeParse({ ...base, type, data }).success).toBe(true);
  });

  it.each([
    ["confiança fora de 0–1", { confidence: 1.5 }],
    ["event_id curto demais", { event_id: "abc" }],
    ["data sem fuso", { occurred_at: "2026-10-14T13:05:00" }],
    ["evidência acima de 500 caracteres", { evidence: "x".repeat(501) }],
    ["versão de schema desconhecida", { schema_version: "2.0" }],
  ])("recusa %s", (_, override) => {
    const event = {
      ...base,
      type: "interaction.logged",
      data: { summary: "oi", channel: "whatsapp" },
      ...override,
    };
    expect(agentEventSchema.safeParse(event).success).toBe(false);
  });

  it("recusa dados que não batem com o tipo", () => {
    expect(
      agentEventSchema.safeParse({
        ...base,
        type: "quote.created",
        data: { description: "x", total: -1 },
      }).success,
    ).toBe(false);
    expect(
      agentEventSchema.safeParse({
        ...base,
        type: "task.suggested",
        data: { type: "x", title: "a", reason: "b", due_date: "15/10" },
      }).success,
    ).toBe(false);
  });

  it("aprovação de orçamento e serviço realizado são de alto risco", () => {
    expect([...HIGH_RISK_TYPES].sort()).toEqual(["quote.status_changed", "service.completed"]);
  });
});

describe("diffCustomerFields", () => {
  const current = {
    name: "Ricardo",
    email: null,
    city: "Sumaré",
    origin: "whatsapp" as const,
    humanEditedFields: ["city"],
    isProvisional: false,
  };
  it("preenche vazios, separa conflitos com edição humana e ignora o resto", () => {
    expect(
      diffCustomerFields(current, { email: "r@x.com", city: "Hortolândia", name: "Ricardo Alves" }),
    ).toEqual({
      fill: { email: "r@x.com" },
      conflicts: ["city"],
      ignored: ["name"],
    });
  });
  it("nome de cliente provisório pode ser substituído", () => {
    expect(
      diffCustomerFields({ ...current, isProvisional: true }, { name: "Ricardo Alves" }).fill,
    ).toEqual({
      name: "Ricardo Alves",
    });
  });
});

describe("thresholdFromEnv", () => {
  it.each([
    [undefined, 0.85],
    ["0.9", 0.9],
    ["abc", 0.85],
    ["1.5", 0.85],
  ])("%j → %d", (value, expected) => {
    expect(thresholdFromEnv(value)).toBe(expected);
  });
});

describe("computeAutoTasks (§7.1)", () => {
  const today = "2026-10-14";
  const tasks = computeAutoTasks(
    {
      quotes: [
        {
          id: "q1",
          customerId: "c1",
          status: "enviado",
          sentAt: storeTimeToUtc("2026-10-09", "22:30"),
          total: 1840,
        },
        {
          id: "q2",
          customerId: "c1",
          status: "aprovado",
          sentAt: storeTimeToUtc("2026-10-09", "10:00"),
          total: 500,
        },
      ],
      services: [
        {
          id: "s1",
          customerId: "c2",
          type: "troca_pneus",
          description: "Troca",
          performedAt: storeTimeToUtc("2026-10-07", "16:00"),
        },
        {
          id: "s2",
          customerId: "c2",
          type: "balanceamento",
          description: "Balanceamento",
          performedAt: storeTimeToUtc("2026-10-07", "16:00"),
        },
      ],
      appointments: [
        {
          id: "a1",
          customerId: "c3",
          status: "agendado",
          scheduledAt: storeTimeToUtc("2026-10-15", "09:00"),
          serviceType: "alinhamento",
        },
        {
          id: "a2",
          customerId: "c3",
          status: "confirmado",
          scheduledAt: storeTimeToUtc("2026-10-15", "10:00"),
          serviceType: "alinhamento",
        },
        {
          id: "a3",
          customerId: "c3",
          status: "agendado",
          scheduledAt: storeTimeToUtc("2026-10-10", "10:00"),
          serviceType: "rodizio",
        },
      ],
    },
    today,
  );
  const by = (rule: string) => tasks.filter((t) => t.autoRule === rule);

  it("R1: só orçamento enviado; vence 3 dias após o envio, contando o dia da loja", () => {
    // 09/10 22:30 em Brasília já é 10/10 em UTC: o vencimento usa o dia da loja (09/10 + 3).
    expect(by("R1")).toEqual([expect.objectContaining({ quoteId: "q1", dueDate: "2026-10-12" })]);
    expect(by("R1")[0].reason).toMatch(/R\$\s1\.840,00/); // pt-BR usa espaço não separável
  });
  it("R2: todo serviço gera pós-venda em 7 dias", () => {
    expect(by("R2").map((t) => t.dueDate)).toEqual(["2026-10-14", "2026-10-14"]);
  });
  it("R3: só troca de pneus/alinhamento, em 180 dias", () => {
    expect(by("R3")).toEqual([expect.objectContaining({ serviceId: "s1", dueDate: "2027-04-05" })]);
  });
  it("R4: só agendamento futuro ainda não confirmado; vence na véspera", () => {
    expect(by("R4")).toEqual([
      expect.objectContaining({ appointmentId: "a1", dueDate: "2026-10-14" }),
    ]);
  });
  it("cancela R1/R4 pendentes cuja condição deixou de valer", () => {
    expect(
      staleAutoTasks(
        [
          { id: "t1", autoRule: "R1", quoteId: "q2", appointmentId: null },
          { id: "t2", autoRule: "R1", quoteId: "q1", appointmentId: null },
          { id: "t3", autoRule: "R4", quoteId: null, appointmentId: "a2" },
          { id: "t4", autoRule: "R2", quoteId: null, appointmentId: null },
        ],
        {
          quotes: [
            { id: "q1", customerId: "c1", status: "enviado", sentAt: null, total: 0 },
            { id: "q2", customerId: "c1", status: "aprovado", sentAt: null, total: 0 },
          ],
          appointments: [
            {
              id: "a2",
              customerId: "c3",
              status: "confirmado",
              scheduledAt: new Date(),
              serviceType: "rodizio",
            },
          ],
        },
      ),
    ).toEqual(["t1", "t3"]);
  });
});

describe("assembleToday (§7.2)", () => {
  const task = (id: string, dueDate: string): TodayTask => ({
    kind: "task",
    id,
    customerId: "c",
    customerName: id,
    phoneE164: null,
    type: "outro",
    title: "t",
    reason: "r",
    dueDate,
    viaAgent: false,
  });

  it("separa atrasados (mais antigo primeiro), hoje e próximos 7 dias", () => {
    const panel = assembleToday({
      today: "2026-10-14",
      pendingReviews: 0,
      appointments: [],
      tasks: [
        task("b", "2026-10-13"),
        task("a", "2026-10-10"),
        task("h", "2026-10-14"),
        task("p", "2026-10-21"),
        task("x", "2026-10-22"),
      ],
    });
    expect(panel.overdue.map((t) => [t.id, t.daysOverdue])).toEqual([
      ["a", 4],
      ["b", 1],
    ]);
    expect(panel.dueToday.map((t) => t.id)).toEqual(["h"]);
    expect(panel.upcoming.map((t) => t.id)).toEqual(["p"]); // 22/10 fica fora dos 7 dias
    expect(panel.allClear).toBe(false);
  });

  it("sem pendências mostra 'tudo em dia'", () => {
    const panel = assembleToday({
      today: "2026-10-14",
      pendingReviews: 0,
      appointments: [],
      tasks: [task("p", "2026-10-20")],
    });
    expect(panel.allClear).toBe(true);
  });

  it("revisão pendente impede o 'tudo em dia'", () => {
    expect(
      assembleToday({ today: "2026-10-14", pendingReviews: 2, appointments: [], tasks: [] })
        .allClear,
    ).toBe(false);
  });
});
