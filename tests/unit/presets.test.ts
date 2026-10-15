import { describe, expect, it } from "vitest";
import { agentEventSchema } from "@/lib/agent/schema";
import {
  buildPresetEvents,
  nextSaturday,
  nextWeekday,
  PRESETS,
  resolvePlaceholders,
} from "@/lib/simulator/presets";

const TODAY = "2026-10-14"; // quarta-feira

describe("presets do simulador (§12.3)", () => {
  it("são as 6 conversas do plano", () => {
    expect(PRESETS).toHaveLength(6);
  });

  it.each(PRESETS.map((p) => [p.id]))("%s gera eventos válidos pelo contrato do §8", (id) => {
    for (const event of buildPresetEvents(id, TODAY, new Date("2026-10-14T13:00:00Z"))) {
      const parsed = agentEventSchema.safeParse(event);
      expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    }
  });

  it("o reenvio usa exatamente os mesmos event_id da conversa 1 (idempotência)", () => {
    const original = buildPresetEvents("orcamento-cliente-novo", TODAY).map((e) => e.event_id);
    const replay = buildPresetEvents("reenvio", TODAY).map((e) => e.event_id);
    expect(replay).toEqual(original);
    expect(new Set(original).size).toBe(original.length);
  });
});

describe("datas relativas", () => {
  it("próximo sábado nunca é o próprio dia", () => {
    expect(nextSaturday("2026-10-14")).toBe("2026-10-17"); // quarta → sábado
    expect(nextSaturday("2026-10-17")).toBe("2026-10-24"); // sábado → sábado seguinte
    expect(nextSaturday("2026-10-18")).toBe("2026-10-24"); // domingo
  });

  it("resolve os marcadores, inclusive dentro de objetos", () => {
    const now = new Date("2026-10-14T13:00:00Z");
    expect(
      resolvePlaceholders(
        { a: "$TODAY", b: "$TODAY+3", c: ["$NEXT_SATURDAY@09:00"], d: "texto" },
        TODAY,
        now,
      ),
    ).toEqual({ a: "2026-10-14", b: "2026-10-17", c: ["2026-10-17T12:00:00.000Z"], d: "texto" });
  });

  it("resolve 'amanhã às 14h' e 'próxima terça às 10h' no horário da loja", () => {
    const now = new Date("2026-10-14T13:00:00Z");
    expect(resolvePlaceholders("$TODAY+1@14:00", TODAY, now)).toBe("2026-10-15T17:00:00.000Z");
    expect(resolvePlaceholders("$NEXT_DOW:2@10:00", TODAY, now)).toBe("2026-10-20T13:00:00.000Z");
    expect(nextWeekday("2026-10-14", 3)).toBe("2026-10-21"); // quarta → quarta seguinte
  });
});
