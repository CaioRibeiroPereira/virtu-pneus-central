import { describe, expect, it } from "vitest";
import { routeOf, scoreExtraction } from "@/lib/agent/evaluation";
import type { AgentEvent } from "@/lib/agent/schema";

const envelope = {
  schema_version: "1.0" as const,
  event_id: "aval-teste-1",
  occurred_at: "2026-10-15T13:00:00-03:00",
  source: { channel: "whatsapp" as const, conversation_id: "c", message_ids: [] },
  agent: { name: "vito-extrator", model: "teste", prompt_version: "v" },
  customer: { phone: "(19) 90000-0021" },
};

describe("routeOf", () => {
  it("aplica só com confiança alta e tipo de baixo risco", () => {
    expect(routeOf("quote.created", 0.9, 0.85)).toBe("aplica");
    expect(routeOf("quote.created", 0.6, 0.85)).toBe("revisão");
    expect(routeOf("quote.status_changed", 0.99, 0.85)).toBe("revisão");
  });
});

describe("scoreExtraction", () => {
  const expected = [
    { type: "customer.upserted", confidence: 0.93, data: { name: "Mariana Lopes" } },
    {
      type: "quote.created",
      confidence: 0.9,
      data: { description: "x", total: 1840, quantity: 4 },
    },
  ];

  it("dá nota cheia quando tipos, campos-chave e rotas batem", () => {
    const got = [
      { ...envelope, type: "customer.upserted", confidence: 0.95, data: { name: "Mariana" } },
      {
        ...envelope,
        type: "quote.created",
        confidence: 0.9,
        data: { description: "4 pneus", total: 1840, quantity: 4 },
      },
    ] as AgentEvent[];
    const score = scoreExtraction(expected, got, 0.85);
    expect(score.points).toBe(score.maxPoints);
    expect(score.maxPoints).toBe(3 + 4); // (tipo+nome+rota) + (tipo+total+quantidade+rota)
  });

  it("aponta o que faltou, o valor errado e o que veio a mais", () => {
    const got = [
      {
        ...envelope,
        type: "quote.created",
        confidence: 0.5,
        data: { description: "4 pneus", total: 1480, quantity: 4 },
      },
      {
        ...envelope,
        type: "interaction.logged",
        confidence: 0.9,
        data: { summary: "s", channel: "whatsapp" },
      },
    ] as AgentEvent[];
    const score = scoreExtraction(expected, got, 0.85);
    expect(score.missing).toEqual(["customer.upserted"]);
    expect(score.extra).toEqual(["interaction.logged"]);
    expect(score.fields.find((f) => f.field === "total")?.ok).toBe(false);
    expect(score.routes[0]).toMatchObject({ expected: "aplica", got: "revisão", ok: false });
  });
});
