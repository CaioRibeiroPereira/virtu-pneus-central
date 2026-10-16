import { describe, expect, it } from "vitest";
import { suggestStockItems, tireQuantity, type StockProduct } from "@/lib/oficina/suggest";

const p = (over: Partial<StockProduct>): StockProduct => ({
  id: "p1",
  name: "Pirelli P1",
  kind: "pneu",
  tireSize: "205/55 R16",
  quantity: 10,
  active: true,
  ...over,
});

describe("quantidade citada", () => {
  it.each([
    ["Trocamos os 4 pneus", 4],
    ["troca de dois pneus dianteiros", 2],
    ["um pneu furado trocado", 1],
    ["Alinhamento feito", null],
  ])("%s → %s", (text, n) => {
    expect(tireQuantity([text])).toBe(n);
  });
});

describe("sugestão de baixa (o gestor confirma)", () => {
  it("medida + quantidade + um único pneu dessa medida → sugere", () => {
    const s = suggestStockItems([p({})], { texts: ["Trocamos os 4 pneus 205/55R16"] });
    expect(s.items).toEqual([{ productId: "p1", quantity: 4 }]);
    expect(s.note).toMatch(/4 × Pirelli P1 205\/55 R16 \(há 10\)/);
  });

  it("a quantidade da conversa vale mais que a do orçamento (orçou 4, trocou 2)", () => {
    const s = suggestStockItems([p({})], {
      texts: ["Troca de 2 pneus dianteiros"],
      quote: { tireSize: "205/55 R16", quantity: 4 },
    });
    expect(s.items).toEqual([{ productId: "p1", quantity: 2 }]);
  });

  it("sem medida na conversa, usa a medida e a quantidade do orçamento", () => {
    const s = suggestStockItems([p({})], {
      texts: ["Serviço concluído"],
      quote: { tireSize: "205/55 R16", quantity: 4 },
    });
    expect(s.items).toEqual([{ productId: "p1", quantity: 4 }]);
  });

  it("não chuta: dois pneus da mesma medida → pede para escolher", () => {
    const s = suggestStockItems([p({}), p({ id: "p2", name: "Michelin" })], {
      texts: ["4 pneus 205/55 R16"],
    });
    expect(s.items).toEqual([]);
    expect(s.note).toMatch(/Há 2 pneus 205\/55 R16.*Pirelli P1, Michelin.*escolha/);
  });

  it("não chuta: sem quantidade, ou sem o pneu no estoque, ou produto inativo", () => {
    expect(suggestStockItems([p({})], { texts: ["pneu 205/55 R16 trocado"] }).items).toEqual([]);
    expect(suggestStockItems([p({})], { texts: ["4 pneus 185/60 R15"] }).note).toMatch(
      /Nenhum pneu 185\/60 R15/,
    );
    expect(
      suggestStockItems([p({ active: false })], { texts: ["4 pneus 205/55 R16"] }).items,
    ).toEqual([]);
  });

  it("sem medida em lugar nenhum: nenhuma sugestão nem aviso", () => {
    expect(suggestStockItems([p({})], { texts: ["Alinhamento feito"] })).toEqual({
      items: [],
      note: null,
    });
  });
});
