import { describe, expect, it } from "vitest";
import { buildPrompt, extractionJsonSchema, postProcess } from "@/lib/agent/extraction";
import { EVENT_TYPES, postProcessLite } from "@/lib/agent/refine";
import { eventDataSchemas } from "@/lib/agent/schema";

const conversation = [
  { from: "cliente", text: "Oi! Aqui é a Mariana. Quanto fica 4 pneus 205/55 R16 pro meu Onix?" },
  { from: "vito", text: "Oi, Mariana! Com montagem fica R$ 1.840,00." },
];
const meta = {
  phone: "(19) 90000-0021",
  conversationId: "conv-teste",
  messageIds: ["m1", "m2"],
  occurredAt: "2026-10-14T13:00:00-03:00",
  model: "teste",
};

describe("formato pedido à IA", () => {
  it("vem do contrato e não traz regex/format (que atrapalham o Ollama)", () => {
    const text = JSON.stringify(extractionJsonSchema());
    expect(text).toContain("quote.created");
    expect(text).not.toContain('"pattern"');
    expect(text).not.toContain('"format"');
    expect(text).not.toContain("quote_id"); // a IA não conhece ids internos
  });

  it("o prompt traz o calendário dos próximos dias (modelos pequenos erram essa conta)", () => {
    const { system } = buildPrompt({ messages: conversation, today: "2026-10-14" });
    expect(system).toContain("quarta-feira 2026-10-14 (hoje)");
    expect(system).toContain("quinta-feira 2026-10-15 (amanhã)");
    expect(system).toContain("sábado 2026-10-17");
  });
});

describe("postProcess", () => {
  it("monta eventos completos e válidos, com telefone do metadado e nome extraído", () => {
    const out = postProcess(
      {
        events: [
          {
            type: "customer.upserted",
            confidence: 0.95,
            evidence: "Aqui é a Mariana.",
            data: { name: "Mariana" },
          },
          {
            type: "quote.created",
            confidence: 0.9,
            evidence: "Com montagem fica R$ 1.840,00.",
            data: { description: "4 pneus 205/55 R16", total: 1840 },
          },
        ],
      },
      conversation,
      meta,
    );
    expect(out.error).toBeUndefined();
    expect(out.events).toHaveLength(2);
    expect(out.events[1]).toMatchObject({
      event_id: "conv-teste-2-quote.created",
      customer: { phone: "(19) 90000-0021", name: "Mariana" },
      confidence: 0.9,
    });
    expect(out.adjustments).toEqual([]);
  });

  it("derruba a confiança quando a evidência ou o valor não estão na conversa", () => {
    const out = postProcess(
      {
        events: [
          {
            type: "quote.created",
            confidence: 0.97,
            evidence: "o preço é 2 mil reais",
            data: { description: "4 pneus", total: 2000 },
          },
        ],
      },
      conversation,
      meta,
    );
    expect(out.events[0].confidence).toBe(0.5);
    expect(out.adjustments[0].reasons).toEqual([
      "evidência não encontrada na conversa",
      "valor não aparece na conversa",
    ]);
  });

  it("agendamento no passado cai para 0,4", () => {
    const out = postProcess(
      {
        events: [
          {
            type: "appointment.requested",
            confidence: 0.9,
            evidence: "Quanto fica 4 pneus",
            data: { scheduled_at: "2026-10-01T09:00:00-03:00", service_type: "alinhamento" },
          },
        ],
      },
      conversation,
      meta,
    );
    expect(out.events[0].confidence).toBe(0.4);
  });

  it("descarta valores que não estão na conversa (caso real: cidade e medida copiadas do prompt)", () => {
    const civic = [
      {
        from: "cliente",
        text: "Pode fechar aquele orçamento dos 4 pneus do Civic. Passo aí na segunda.",
      },
      { from: "vito", text: "Ótimo, Ricardo! Vou avisar a equipe." },
    ];
    const out = postProcess(
      {
        events: [
          {
            type: "customer.upserted",
            confidence: 0.9,
            evidence: "Ótimo, Ricardo!",
            data: { name: "Ricardo", city: "Campinas" },
          },
          {
            type: "vehicle.identified",
            confidence: 0.9,
            evidence: "4 pneus do Civic",
            data: { model: "Civic", tire_size: "205/55 R16" },
          },
          {
            type: "vehicle.identified",
            confidence: 0.9,
            evidence: "4 pneus do Civic",
            data: { plate: "ABC1D23" },
          },
        ],
      },
      civic,
      meta,
    );
    expect(out.events.map((e) => e.data)).toEqual([{ name: "Ricardo" }, { model: "Civic" }]);
    expect(out.adjustments.map((a) => a.removed)).toEqual([["city"], ["tire_size"]]);
    expect(out.rejected).toEqual([{ index: 2, issues: ["nada da conversa sustenta: plate"] }]);
  });

  it("aceita placa e medida escritas de outro jeito, e nome parcial", () => {
    const out = postProcess(
      {
        events: [
          {
            type: "vehicle.identified",
            confidence: 0.9,
            evidence: "pro meu Onix",
            data: { model: "Chevrolet Onix", tire_size: "205/55R16" },
          },
        ],
      },
      conversation,
      meta,
    );
    expect(out.events[0].data).toEqual({ model: "Chevrolet Onix", tire_size: "205/55R16" });
    expect(out.adjustments).toEqual([]);
  });

  it("agendamento sem a hora citada ou em outro dia da semana cai para 0,5", () => {
    const talk = [
      { from: "cliente", text: "Dá pra alinhar no sábado às 9h?" },
      { from: "vito", text: "Pode sim, sábado às 9h." },
    ];
    const appointment = (scheduled_at: string) =>
      postProcess(
        {
          events: [
            {
              type: "appointment.requested",
              confidence: 0.9,
              evidence: "sábado às 9h",
              data: { scheduled_at, service_type: "alinhamento" },
            },
          ],
        },
        talk,
        meta,
      ).events[0].confidence;
    expect(appointment("2026-10-17T09:00:00-03:00")).toBe(0.9); // sábado, 9h
    expect(appointment("2026-10-17T00:00:00-03:00")).toBe(0.5); // hora inventada
    expect(appointment("2026-10-16T09:00:00-03:00")).toBe(0.5); // sexta
  });

  it("a versão do n8n (sem zod) produz os mesmos eventos que o postProcess", () => {
    const raw = {
      events: [
        {
          type: "customer.upserted",
          confidence: 0.95,
          evidence: "Aqui é a Mariana.",
          data: { name: "Mariana", city: "Campinas" },
        },
        {
          type: "quote.created",
          confidence: 0.97,
          evidence: "Com montagem fica R$ 1.840,00.",
          data: { description: "4 pneus 205/55 R16", total: 1840, tire_size: "205/55 R16" },
        },
        { type: "inventado", confidence: 1, evidence: "", data: {} },
      ],
    };
    const full = postProcess(raw, conversation, meta);
    const lite = postProcessLite(raw, conversation, meta);
    expect(lite.events).toEqual(full.events);
    expect(lite.adjustments).toEqual(full.adjustments);
    expect(lite.rejected.map((r) => r.index)).toEqual(full.rejected.map((r) => r.index));
  });

  it("a lista de tipos sem zod bate com o contrato", () => {
    expect([...EVENT_TYPES].sort()).toEqual(Object.keys(eventDataSchemas).sort());
  });

  it("JSON inválido ou fora do formato vira erro, sem eventos", () => {
    expect(postProcess("não é json", conversation, meta).error).toMatch(/JSON/);
    expect(postProcess({ events: [{ type: "x" }] }, conversation, meta).events).toEqual([]);
  });

  it("evento com dado fora do contrato completo é rejeitado individualmente", () => {
    const out = postProcess(
      {
        events: [
          {
            type: "customer.upserted",
            confidence: 0.9,
            evidence: "Aqui é a Mariana.",
            data: { email: "nao-e-email" },
          },
          {
            type: "interaction.logged",
            confidence: 0.9,
            evidence: "Quanto fica",
            data: { summary: "Pediu preço", channel: "whatsapp" },
          },
        ],
      },
      conversation,
      meta,
    );
    expect(out.events.map((e) => e.type)).toEqual(["interaction.logged"]);
    expect(out.rejected[0].index).toBe(0);
  });
});
