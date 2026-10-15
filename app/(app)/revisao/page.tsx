import type { Metadata } from "next";
import Link from "next/link";
import { CircleCheck } from "lucide-react";
import { getDb } from "@/db";
import { formatDateTime } from "@/lib/dates";
import {
  customerOptions,
  fieldLabel,
  listPendingReviews,
  recentDecisions,
} from "@/lib/review/queries";
import { ReviewCard } from "@/components/review-card";

export const metadata: Metadata = { title: "Revisão | Central de clientes" };
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  aprovado: "Aprovada",
  aprovado_editado: "Aprovada com correção",
  rejeitado: "Rejeitada",
};

export default async function RevisaoPage() {
  const db = getDb();
  const [cards, customers, decided] = await Promise.all([
    listPendingReviews(db),
    customerOptions(db),
    recentDecisions(db),
  ]);
  const labels = Object.fromEntries(
    [...new Set(cards.flatMap((c) => Object.keys(c.data)))].map((k) => [k, fieldLabel(k)]),
  );

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Revisão</h1>
          <p className="muted" style={{ marginTop: 4 }}>
            O Vito só aplica sozinho o que é de baixo risco e tem certeza. O resto espera você aqui.
          </p>
        </div>
      </div>

      {cards.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 32 }}>
          <CircleCheck aria-hidden="true" size={40} color="var(--primary)" />
          <h2 style={{ marginTop: 8 }}>Nenhuma sugestão esperando</h2>
          <p className="muted" style={{ marginTop: 4 }}>
            Quando o Vito tiver dúvida ou a sugestão mexer com dinheiro, ela aparece aqui.
          </p>
        </div>
      ) : (
        <ul className="stack">
          {cards.map((card) => (
            <ReviewCard key={card.id} card={card} customers={customers} fieldLabels={labels} />
          ))}
        </ul>
      )}

      {decided.length > 0 && (
        <section className="section" aria-labelledby="decididas">
          <h2 id="decididas" className="section-title">
            Decididas recentemente
          </h2>
          <ul className="stack">
            {decided.map((d) => (
              <li key={d.id} className="card">
                <p>
                  <strong>{STATUS_LABEL[d.status] ?? d.status}</strong> · {d.type}
                  {d.customerId && (
                    <>
                      {" "}
                      · <Link href={`/clientes/${d.customerId}`}>{d.customerName}</Link>
                    </>
                  )}
                </p>
                {d.decidedAt && <p className="muted">{formatDateTime(d.decidedAt)}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
