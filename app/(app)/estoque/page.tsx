import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Package } from "lucide-react";
import { getDb } from "@/db";
import { formatMoney } from "@/lib/labels";
import { listProducts } from "@/lib/oficina/inventory";
import { ProductForm } from "@/components/oficina-forms";

export const metadata: Metadata = { title: "Estoque | Central de clientes" };
export const dynamic = "force-dynamic";

// Estoque (D58): pneus e itens, com alerta de estoque baixo. A baixa é automática ao registrar
// um serviço com itens na ficha do cliente.
export default async function EstoquePage({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string }>;
}) {
  const { filtro } = await searchParams;
  const all = await listProducts(getDb());
  const low = all.filter((p) => p.low);
  const items = filtro === "baixo" ? low : all;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Estoque</h1>
          <p className="muted" style={{ marginTop: 4 }}>
            Pneus e itens. Ao registrar um serviço com itens na ficha do cliente, a baixa é
            automática.
          </p>
        </div>
      </div>

      <ProductForm />

      <nav aria-label="Filtrar estoque">
        <ul className="chips">
          <li>
            <Link
              href="/estoque"
              className="chip"
              aria-current={filtro !== "baixo" ? "page" : undefined}
            >
              Tudo <span className="n">{all.length}</span>
            </Link>
          </li>
          <li>
            <Link
              href="/estoque?filtro=baixo"
              className="chip"
              aria-current={filtro === "baixo" ? "page" : undefined}
            >
              Estoque baixo <span className="n">{low.length}</span>
            </Link>
          </li>
        </ul>
      </nav>

      {items.length === 0 && (
        <section className="card section" style={{ textAlign: "center", padding: 32 }}>
          <Package aria-hidden="true" size={40} color="var(--accent-text)" />
          <h2 style={{ marginTop: 8 }}>
            {filtro === "baixo" ? "Nada com estoque baixo" : "Nenhum produto cadastrado"}
          </h2>
        </section>
      )}

      <ul className="stack section">
        {items.map((p) => (
          <li key={p.id} className="card">
            <div className="task-top">
              <span className="avatar" aria-hidden="true">
                {p.quantity}
              </span>
              <h2 style={{ fontSize: "1.0625rem" }}>
                <Link href={`/estoque/${p.id}`}>
                  {p.name}
                  {p.tireSize ? ` ${p.tireSize}` : ""}
                </Link>
              </h2>
              {p.low && (
                <span className="pill pill-overdue">
                  <AlertTriangle aria-hidden="true" size={13} style={{ verticalAlign: "-2px" }} />{" "}
                  estoque baixo
                </span>
              )}
              {!p.active && <span className="pill">inativo</span>}
            </div>
            <p className="muted" style={{ marginTop: 8 }}>
              {p.quantity} em estoque (mínimo {p.minQuantity}) · {formatMoney(p.price)} cada ·{" "}
              {p.kind === "pneu" ? "Pneu" : "Item"}
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}
