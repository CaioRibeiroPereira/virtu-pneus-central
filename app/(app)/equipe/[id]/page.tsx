import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { describeDue, formatDateTime, todayInStore } from "@/lib/dates";
import { formatMoney } from "@/lib/labels";
import { employeeDetail } from "@/lib/oficina/team";
import { EmployeeForm } from "@/components/oficina-forms";

export const metadata: Metadata = { title: "Funcionário | Equipe" };
export const dynamic = "force-dynamic";

export default async function FuncionarioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const detail = await employeeDetail(getDb(), id);
  if (!detail) notFound();
  const { employee: e, pending, done } = detail;
  const firstName = e.name.split(" ")[0];
  const today = todayInStore();

  return (
    <>
      <p style={{ marginBottom: 8 }}>
        <Link href="/equipe">← Equipe</Link>
      </p>
      <section className="card">
        <h1>{e.name}</h1>
        <p className="muted" style={{ marginTop: 4 }}>
          {e.role}
          {e.phoneDisplay ? ` · ${e.phoneDisplay}` : ""}
          {!e.active && " · inativo"}
        </p>
      </section>

      <section className="section" aria-labelledby="pendentes">
        <h2 id="pendentes" className="section-title">
          Ações pendentes <span className="badge">{pending.length}</span>
        </h2>
        {pending.length === 0 ? (
          <p className="muted">Nada pendente com {firstName}.</p>
        ) : (
          <ul className="stack">
            {pending.map((t) => (
              <li key={t.id} className="card">
                <p>
                  <Link href={`/clientes/${t.customerId}`}>
                    <strong>{t.customerName}</strong>
                  </Link>{" "}
                  · {t.title}
                </p>
                <p className={t.dueDate < today ? "due-overdue" : "muted"}>
                  {describeDue(t.dueDate, today)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section" aria-labelledby="feitos">
        <h2 id="feitos" className="section-title">
          Serviços feitos <span className="badge">{done.length}</span>
        </h2>
        {done.length === 0 ? (
          <p className="muted">Nenhum serviço registrado com {firstName} ainda.</p>
        ) : (
          <ul className="stack">
            {done.map((s) => (
              <li key={s.id} className="card">
                <p>
                  <Link href={`/clientes/${s.customerId}`}>
                    <strong>{s.customerName}</strong>
                  </Link>{" "}
                  · {s.description}
                </p>
                <p className="muted">
                  {formatDateTime(s.performedAt)}
                  {s.total !== null ? ` · ${formatMoney(s.total)}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="section">
        <EmployeeForm
          employee={{
            id: e.id,
            name: e.name,
            role: e.role,
            phoneDisplay: e.phoneDisplay,
            active: e.active,
          }}
        />
      </div>
    </>
  );
}
