import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/db";
import { listEmployees } from "@/lib/oficina/team";
import { EmployeeForm } from "@/components/oficina-forms";

export const metadata: Metadata = { title: "Equipe | Central de clientes" };
export const dynamic = "force-dynamic";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

// Equipe (D58): cadastro e "responsável" nas ações e serviços. Um login só (o do dono — D4).
export default async function EquipePage() {
  const employees = await listEmployees(getDb());
  return (
    <>
      <div className="page-header">
        <div>
          <h1>Equipe</h1>
          <p className="muted" style={{ marginTop: 4 }}>
            Quem trabalha na oficina. Escolha o responsável nas próximas ações e nos serviços da
            ficha do cliente.
          </p>
        </div>
      </div>
      <EmployeeForm />
      <ul className="stack section">
        {employees.map((e) => (
          <li key={e.id} className="card">
            <div className="task-top">
              <span className="avatar" aria-hidden="true">
                {initials(e.name)}
              </span>
              <h2 style={{ fontSize: "1.0625rem" }}>
                <Link href={`/equipe/${e.id}`}>{e.name}</Link>
              </h2>
              {!e.active && <span className="pill">inativo</span>}
            </div>
            <p className="muted" style={{ marginTop: 6 }}>
              {e.role}
              {e.phoneDisplay ? ` · ${e.phoneDisplay}` : ""}
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}
