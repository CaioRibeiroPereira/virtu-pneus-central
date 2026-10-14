import { describe, expect, it } from "vitest";
import {
  addDays,
  describeDue,
  diffInDays,
  formatDate,
  formatDateTime,
  formatTime,
  storeDateOf,
  storeTimeToUtc,
  todayInStore,
} from "@/lib/dates";

describe("todayInStore", () => {
  it("às 23:30 de terça em Brasília ainda é terça, mesmo já sendo quarta em UTC", () => {
    // Terça 13/10/2026 23:30 em Brasília = quarta 14/10/2026 02:30 UTC.
    const instant = new Date("2026-10-14T02:30:00Z");
    expect(instant.toISOString().slice(0, 10)).toBe("2026-10-14");
    expect(todayInStore(instant)).toBe("2026-10-13");
  });

  it("à 00:30 de quarta em Brasília já é quarta", () => {
    expect(todayInStore(new Date("2026-10-14T03:30:00Z"))).toBe("2026-10-14");
  });
});

describe("addDays / diffInDays", () => {
  it("atravessa fim de mês e de ano", () => {
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("soma 180 dias (regra de retorno comercial)", () => {
    expect(addDays("2026-04-17", 180)).toBe("2026-10-14");
  });

  it("calcula a diferença em dias de calendário", () => {
    expect(diffInDays("2026-10-14", "2026-10-17")).toBe(3);
    expect(diffInDays("2026-10-14", "2026-10-11")).toBe(-3);
    expect(diffInDays("2026-10-14", "2026-10-14")).toBe(0);
  });

  it("rejeita datas fora do formato AAAA-MM-DD", () => {
    expect(() => addDays("14/10/2026", 1)).toThrow();
  });
});

describe("storeTimeToUtc / storeDateOf", () => {
  it("converte 09:00 de Brasília para 12:00 UTC", () => {
    expect(storeTimeToUtc("2026-10-14", "09:00").toISOString()).toBe("2026-10-14T12:00:00.000Z");
  });

  it("22:00 de Brasília cai no dia seguinte em UTC, mas no mesmo dia da loja", () => {
    const instant = storeTimeToUtc("2026-10-14", "22:00");
    expect(instant.toISOString()).toBe("2026-10-15T01:00:00.000Z");
    expect(storeDateOf(instant)).toBe("2026-10-14");
  });
});

describe("formatação", () => {
  it("formata data, data e hora e hora no fuso da loja", () => {
    const instant = new Date("2026-10-14T21:39:00Z"); // 18:39 em Brasília
    expect(formatDate("2026-10-14")).toBe("14/10/2026");
    expect(formatTime(instant)).toBe("18:39");
    expect(formatDateTime(instant)).toBe("14/10/2026, 18:39");
  });
});

describe("describeDue", () => {
  const today = "2026-10-14";
  it.each([
    ["2026-10-14", "vence hoje"],
    ["2026-10-15", "vence amanhã"],
    ["2026-10-17", "vence em 3 dias"],
    ["2026-10-13", "atrasado há 1 dia"],
    ["2026-10-09", "atrasado há 5 dias"],
  ])("%s → %s", (due, expected) => {
    expect(describeDue(due, today)).toBe(expected);
  });
});
