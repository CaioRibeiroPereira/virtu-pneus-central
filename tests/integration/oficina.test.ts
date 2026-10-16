// Oficina (D58) em Postgres de verdade (PGlite): estoque com baixa automática e histórico,
// estoque insuficiente desfazendo o serviço inteiro, responsável, e o seed da demonstração.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { count, eq, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { customers, products, services, stockMovements } from "@/db/schema";
import { resetDemoData } from "@/db/reset";
import { addService, addTask } from "@/lib/customers/commands";
import {
  addStockEntry,
  adjustStock,
  createProduct,
  lowStock,
  productDetail,
  StockError,
} from "@/lib/oficina/inventory";
import { createEmployee, employeeDetail } from "@/lib/oficina/team";
import { createTestDb } from "../helpers/db";

const TODAY = "2026-10-16";
let db: Db;
let close: () => Promise<void>;
let customerId: string;
let pneu: string;
let valvula: string;
let ze: string;

const qty = async (id: string) =>
  (await db.select({ q: products.quantity }).from(products).where(eq(products.id, id)))[0].q;
const serviceCount = async () => (await db.select({ n: count() }).from(services))[0].n;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  [{ id: customerId }] = await db
    .insert(customers)
    .values({ name: "Cliente Teste", phoneE164: "+5519900000050", phoneDisplay: "(19) 90000-0050" })
    .returning({ id: customers.id });
  pneu = await createProduct(db, {
    kind: "pneu",
    name: "Pirelli P1",
    tireSize: "205/55 R16",
    price: 460,
    minQuantity: 4,
    quantity: 6,
  });
  valvula = await createProduct(db, {
    kind: "item",
    name: "Válvula",
    price: 8,
    minQuantity: 5,
    quantity: 10,
  });
  ze = await createEmployee(db, { name: "Zé Carlos", role: "Mecânico", active: true });
});
afterAll(() => close());

describe("estoque", () => {
  it("estoque inicial vira a primeira movimentação", async () => {
    const d = await productDetail(db, pneu);
    expect(d?.movements.map((m) => [m.kind, m.quantity, m.note])).toEqual([
      ["entrada", 6, "Estoque inicial"],
    ]);
  });

  it("serviço com itens: baixa automática, ligada ao serviço e ao responsável", async () => {
    await addService(
      db,
      customerId,
      {
        type: "troca_pneus",
        description: "Troca de 4 pneus",
        date: TODAY,
        total: 1940,
        employeeId: ze,
        items: [
          { productId: pneu, quantity: 4 },
          { productId: valvula, quantity: 4 },
        ],
      },
      TODAY,
    );
    expect(await qty(pneu)).toBe(2);
    expect(await qty(valvula)).toBe(6);
    const d = await productDetail(db, pneu);
    expect(d?.movements[0]).toMatchObject({
      kind: "saida_servico",
      quantity: -4,
      customerName: "Cliente Teste",
    });
    expect(d?.product.low).toBe(true); // 2 ≤ mínimo 4
    const team = await employeeDetail(db, ze);
    expect(team?.done.map((s) => s.description)).toEqual(["Troca de 4 pneus"]);
  });

  it("falta de estoque: nada é gravado (nem o serviço) e a mensagem diz quanto há", async () => {
    const before = await serviceCount();
    await expect(
      addService(
        db,
        customerId,
        {
          type: "troca_pneus",
          description: "Mais 4 pneus",
          date: TODAY,
          items: [
            { productId: valvula, quantity: 2 }, // esta caberia…
            { productId: pneu, quantity: 4 }, // …esta não: há 2
          ],
        },
        TODAY,
      ),
    ).rejects.toThrow(/Estoque insuficiente: Pirelli P1 \(há 2, o serviço usa 4\)/);
    expect(await serviceCount()).toBe(before);
    expect(await qty(valvula)).toBe(6); // a baixa da válvula também foi desfeita
    expect(await qty(pneu)).toBe(2);
  });

  it("o mesmo produto em duas linhas soma antes de conferir", async () => {
    await expect(
      addService(
        db,
        customerId,
        {
          type: "troca_pneus",
          description: "Duas linhas",
          date: TODAY,
          items: [
            { productId: pneu, quantity: 1 },
            { productId: pneu, quantity: 2 },
          ],
        },
        TODAY,
      ),
    ).rejects.toBeInstanceOf(StockError);
  });

  it("entrada e ajuste pela contagem ficam no histórico", async () => {
    expect(await addStockEntry(db, pneu, 8, "NF 123")).toBe(10);
    expect(await adjustStock(db, pneu, 9, "Contagem: 1 avariado")).toBe(9);
    const d = await productDetail(db, pneu);
    expect(d?.movements.slice(0, 2).map((m) => [m.kind, m.quantity, m.note])).toEqual([
      ["ajuste", -1, "Contagem: 1 avariado"],
      ["entrada", 8, "NF 123"],
    ]);
  });

  it("o banco recusa estoque negativo mesmo fora das funções (CHECK)", async () => {
    await expect(
      db
        .update(products)
        .set({ quantity: sql`-1` })
        .where(eq(products.id, pneu)),
    ).rejects.toThrow();
  });
});

describe("responsável nas próximas ações", () => {
  it("a ação aparece na página do funcionário", async () => {
    await addTask(
      db,
      customerId,
      {
        type: "pos_venda",
        title: "Ligar sobre a troca",
        reason: "Pós-venda",
        dueDate: TODAY,
        assigneeId: ze,
      },
      TODAY,
    );
    const team = await employeeDetail(db, ze);
    expect(team?.pending.map((t) => t.title)).toContain("Ligar sobre a troca");
  });
});

describe("seed da demonstração", () => {
  it("traz equipe, tabela de serviços e 3 produtos com estoque baixo", async () => {
    const summary = await resetDemoData(db, TODAY);
    expect(summary.employees).toBe(3);
    expect(summary.products).toBe(7);
    expect((await lowStock(db)).map((p) => p.name).sort()).toEqual([
      "Bridgestone Turanza",
      "Kit de pesos de balanceamento",
      "Michelin Primacy 4",
    ]);
    const [{ n }] = await db.select({ n: count() }).from(stockMovements);
    expect(n).toBe(7); // um "estoque inicial" por produto
  });
});
