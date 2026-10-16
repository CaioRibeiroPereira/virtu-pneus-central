import type { Metadata } from "next";
import { sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { hasSession } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/dates";

export const metadata: Metadata = { title: "Saúde do sistema | Grupo Virtù Pneus" };

// Sempre consulta o banco na hora (nada de página estática em cache).
export const dynamic = "force-dynamic";

/** Tabelas contadas na página (nome no banco → rótulo). Lista fixa: nada vem do usuário. */
const TABLES = [
  ["customers", "Clientes"],
  ["vehicles", "Veículos"],
  ["quotes", "Orçamentos"],
  ["services", "Serviços"],
  ["appointments", "Agendamentos"],
  ["tasks", "Próximas ações"],
  ["agent_events", "Eventos de agentes"],
  ["review_items", "Fila de revisão"],
  ["telegram_chats", "Conversas do Telegram"],
  ["telegram_messages", "Mensagens do Telegram"],
  ["products", "Produtos do estoque"],
  ["stock_movements", "Movimentações de estoque"],
  ["service_catalog", "Tabela de serviços"],
  ["employees", "Equipe"],
] as const;

type Check =
  | { ok: true; ms: number; serverTime: string; counts: { label: string; total: number | null }[] }
  | { ok: false };

async function countRows(table: string): Promise<number | null> {
  const db = getDb();
  // A tabela pode ainda não existir (antes das migrations): isso não é erro de conexão.
  const exists = await db.execute<{ found: boolean }>(
    sql`select to_regclass(${`public.${table}`}) is not null as found`,
  );
  if (!exists.rows[0]?.found) return null;
  const result = await db.execute<{ total: number }>(
    sql`select count(*)::int as total from ${sql.identifier(table)}`,
  );
  return result.rows[0]?.total ?? 0;
}

async function checkDatabase(): Promise<Check> {
  const started = performance.now();
  try {
    const db = getDb();
    const now = await db.execute<{ epoch: number }>(
      sql`select extract(epoch from now())::float8 as epoch`,
    );
    const ms = Math.round(performance.now() - started);
    const counts = await Promise.all(
      TABLES.map(async ([table, label]) => ({ label, total: await countRows(table) })),
    );
    const epoch = Number(now.rows[0]?.epoch);
    // Hora do banco no relógio da loja (Brasília), como o resto do sistema.
    const serverTime = Number.isFinite(epoch) ? formatDateTime(new Date(epoch * 1000)) : "";
    return { ok: true, ms, serverTime, counts };
  } catch (e) {
    // Detalhe só no log do servidor; a página não expõe mensagens internas.
    console.error("health check falhou", e);
    return { ok: false };
  }
}

export default async function SaudePage() {
  if (!(await hasSession())) redirect("/login?next=/saude");
  const check = await checkDatabase();
  return (
    <>
      <div className="page-header">
        <h1>Saúde do sistema</h1>
      </div>
      <section className="card" style={{ marginTop: 16 }}>
        <h2>Banco de dados (Neon Postgres)</h2>
        {check.ok ? (
          <>
            <ul style={{ marginTop: 12, lineHeight: 1.8 }}>
              <li>
                <strong>Status:</strong> conectado
              </li>
              <li>
                <strong>Tempo da primeira consulta:</strong> {check.ms} ms
              </li>
              <li>
                <strong>Hora do banco (Brasília):</strong> {check.serverTime}
              </li>
            </ul>
            <h3 style={{ marginTop: 20 }}>Registros por tabela</h3>
            <ul style={{ marginTop: 8, lineHeight: 1.8 }}>
              {check.counts.map(({ label, total }) => (
                <li key={label}>
                  <strong>{label}:</strong>{" "}
                  {total === null ? "tabela ainda não criada (rode as migrations)" : total}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p role="alert" style={{ marginTop: 12 }}>
            <strong>Status:</strong> sem conexão com o banco. Verifique a variável DATABASE_URL.
          </p>
        )}
      </section>
    </>
  );
}
