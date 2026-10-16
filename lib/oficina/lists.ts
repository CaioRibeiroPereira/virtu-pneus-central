// Listas para os formulários da ficha (D58): só o que está ativo.
import type { Db } from "@/db";
import type { OficinaLists } from "@/components/quick-actions";
import { listProducts } from "./inventory";
import { listCatalog, listEmployees } from "./team";

export async function oficinaLists(db: Db): Promise<OficinaLists> {
  const [employees, catalog, products] = await Promise.all([
    listEmployees(db, { activeOnly: true }),
    listCatalog(db, { activeOnly: true }),
    listProducts(db),
  ]);
  return {
    employees: employees.map((e) => ({ id: e.id, name: `${e.name} (${e.role})` })),
    catalog: catalog.map((c) => ({ id: c.id, name: c.name, type: c.type, price: c.price })),
    products: products
      .filter((p) => p.active)
      .map((p) => ({
        id: p.id,
        label: `${p.name}${p.tireSize ? ` ${p.tireSize}` : ""} — ${p.quantity} em estoque`,
      })),
  };
}
