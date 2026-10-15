import { describe, expect, it } from "vitest";
import { buildPrompt, extractionJsonSchema, postProcess } from "@/lib/agent/extraction";

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
