import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { formatDateTime } from "@/lib/dates";
import { formatMoney } from "@/lib/labels";
import { productDetail } from "@/lib/oficina/inventory";
import { ProductForm, StockAdjustForm, StockEntryForm } from "@/components/oficina-forms";

export const metadata: Metadata = { title: "Produto | Estoque" };
export const dynamic = "force-dynamic";

const KIND: Record<string, string> = {
  entrada: "Entrada",
  saida_servico: "Saída (serviço)",
  ajuste: "Ajuste",
};

export default async function ProdutoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const detail = await productDetail(getDb(), id);
  if (!detail) notFound();
  const { product: p, movements } = detail;

  return (
    <>
      <p style={{ marginBottom: 8 }}>
        <Link href="/estoque">← Estoque</Link>
      </p>
      <section className="card">
        <h1>
          {p.name}
          {p.tireSize ? ` ${p.tireSize}` : ""}
        </h1>
        <p style={{ marginTop: 6, fontSize: "1.125rem" }}>
          <strong>{p.quantity}</strong> em estoque · mínimo {p.minQuantity} · {formatMoney(p.price)}{" "}
          cada
          {p.low && (
            <>
              {" "}
              <span className="pill pill-overdue">estoque baixo</span>
            </>
          )}
        </p>
      </section>

      <div className="stack section">
        <StockEntryForm productId={p.id} name={p.name} />
        <StockAdjustForm productId={p.id} name={p.name} />
        <ProductForm
          product={{
            id: p.id,
            kind: p.kind,
            name: p.name,
            tireSize: p.tireSize,
            price: p.price,
            minQuantity: p.minQuantity,
            active: p.active,
          }}
        />
      </div>

      <section className="section" aria-labelledby="movimentacoes">
        <h2 id="movimentacoes" className="section-title">
          Movimentações
        </h2>
        {movements.length === 0 ? (
          <p className="muted">Nenhuma movimentação ainda.</p>
        ) : (
          <ul className="timeline">
            {movements.map((m) => (
              <li key={m.id}>
                <p className="muted tabular" style={{ fontSize: "0.9375rem" }}>
                  {formatDateTime(m.createdAt)}
                </p>
                <p>
                  <strong>
                    {KIND[m.kind]} {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                  </strong>
                  {m.customerId && (
                    <>
                      {" "}
                      · <Link href={`/clientes/${m.customerId}`}>{m.customerName}</Link>
                    </>
                  )}
                  {m.note && <span className="muted"> · {m.note}</span>}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
