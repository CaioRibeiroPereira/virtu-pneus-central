import { describe, expect, it } from "vitest";
import { matchesSearch, normalizePlate, normalizeText, type Searchable } from "@/lib/search";

const andre: Searchable = {
  name: "André Martins",
  phoneE164: "+5519988887777",
  email: "andre@example.com",
  plates: ["ABC1D23"],
};

describe("normalização", () => {
  it("remove acentos, maiúsculas e espaços extras", () => {
    expect(normalizeText("  JOÃO   da  Conceição ")).toBe("joao da conceicao");
  });
  it("normaliza placa", () => {
    expect(normalizePlate("abc-1d23")).toBe("ABC1D23");
  });
});

describe("matchesSearch (§7.3 do plano)", () => {
  it.each([
    ["andre", true], // sem acento
    ["ANDRÉ", true], // maiúsculas
    ["martins andre", true], // palavras em outra ordem
    ["1998888", true], // telefone por dígitos
    ["(19) 98888-7777", true], // telefone formatado
    ["98888-7777", true],
    ["abc1d23", true], // placa sem traço
    ["ABC-1D23", true], // placa com traço
    ["andre@example", true], // e-mail
    ["", true], // busca vazia mostra todos
    ["patricia", false],
    ["777", false], // poucos dígitos não viram busca por telefone
    ["XYZ9Z99", false],
  ])("%j → %s", (query, expected) => {
    expect(matchesSearch(andre, query)).toBe(expected);
  });

  it("funciona sem telefone e sem placa", () => {
    expect(matchesSearch({ name: "Ana Souza" }, "ana")).toBe(true);
    expect(matchesSearch({ name: "Ana Souza" }, "1998888")).toBe(false);
  });
});
