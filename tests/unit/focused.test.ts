import { describe, expect, it } from "vitest";
import { buildTypePrompt, mergeTypeOutputs, parseTypes } from "@/lib/agent/focused";
import { findHints, formatHints } from "@/lib/agent/hints";
import { buildPrompt } from "@/lib/agent/prompt";
import { applyVerdicts, buildVerifyPrompt, parseVerdict } from "@/lib/agent/verify";

const talk = [
  { from: "cliente", text: "Meu Onix é placa abc-1d23, pneu 205/55R16. Dá pra ir amanhã às 9h?" },
  { from: "vito", text: "Dá sim! Os 4 ficam R$ 1.840,00, ou R$ 460 cada." },
];

describe("dados encontrados por código", () => {
  it("acha placa, medida, valores e horários e normaliza", () => {
    expect(findHints(talk)).toEqual({
      plates: ["ABC1D23"],
      tireSizes: ["205/55 R16"],
      amounts: [1840, 460],
      hours: [9],
    });
  });

  it("não inventa nada quando o texto não tem esses dados; '80 km/h' não é horário", () => {
    const h = findHints([{ from: "cliente", text: "Faz barulho acima de 80 km/h, sou o Paulo." }]);
    expect(formatHints(h)).toBe("");
  });

  it("entram no pedido só quando ligadas", () => {
    expect(buildPrompt({ messages: talk, today: "2026-10-15" }).user).not.toContain("encontrados");
    expect(buildPrompt({ messages: talk, today: "2026-10-15", hints: true }).user).toContain(
      "placas: ABC1D23",
    );
  });
});

describe("extração focada", () => {
  it("lê a classificação e ignora tipos desconhecidos ou repetidos", () => {
    expect(parseTypes('{"types":["quote.created","inventado","quote.created"]}')).toEqual([
      "quote.created",
    ]);
    expect(parseTypes("não é json")).toEqual([]);
  });

  it("descarta o tipo que o próprio modelo marcou com confiança ~0 e JSON inválido", () => {
    const merged = mergeTypeOutputs([
      { type: "quote.created", text: '{"confidence":0.9,"evidence":"x","data":{"total":1}}' },
      { type: "appointment.requested", text: '{"confidence":0,"evidence":"","data":{}}' },
      { type: "vehicle.identified", text: "quebrado" },
    ]);
    expect(merged.events).toEqual([
      { type: "quote.created", confidence: 0.9, evidence: "x", data: { total: 1 } },
    ]);
  });

  it("o exemplo de agendamento usa a próxima sexta do calendário", () => {
    const p = buildTypePrompt({
      messages: talk,
      today: "2026-10-15",
      type: "appointment.requested",
    });
    expect(p.system).toContain("2026-10-16T16:00:00-03:00"); // quinta → sexta
  });
});

describe("verificação (sim/não por evento)", () => {
  it("lê o veredito; resposta ilegível conta como reprovação", () => {
    expect(parseVerdict('{"sustentado":true,"motivo":"está na conversa"}').sustained).toBe(true);
    expect(parseVerdict('{"sustentado":false,"motivo":"valor inventado"}').sustained).toBe(false);
    expect(parseVerdict("???").sustained).toBe(false);
  });

  it("rebaixa para 0,5 só os reprovados, sem apagar nada", () => {
    const events = [
      { type: "quote.created", confidence: 0.95, data: { total: 760 } },
      { type: "vehicle.identified", confidence: 0.9, data: { model: "Gol" } },
      { type: "interaction.logged", confidence: 0.3, data: {} },
    ];
    const out = applyVerdicts(events, [
      { sustained: false },
      { sustained: true },
      { sustained: false },
    ]);
    expect(out.map((e) => e.confidence)).toEqual([0.5, 0.9, 0.3]);
  });

  it("o pedido mostra o evento e a conversa, sem gabarito", () => {
    const p = buildVerifyPrompt({
      messages: talk,
      event: { type: "quote.created", data: { total: 1840 }, evidence: "R$ 1.840,00" },
    });
    expect(p.user).toContain('tipo "quote.created"');
    expect(p.user).toContain('{"total":1840}');
    expect(p.user).toContain("[cliente] Meu Onix");
  });
});
