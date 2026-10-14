import type { Metadata } from "next";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";

export const metadata: Metadata = { title: "Saúde do sistema | Grupo Virtù Pneus" };

// Sempre consulta o banco na hora (nada de página estática em cache).
export const dynamic = "force-dynamic";

type Check = { ok: true; ms: number; serverTime: string; customers: number | null } | { ok: false };

async function checkDatabase(): Promise<Check> {
  const started = performance.now();
  try {
    const db = getDb();
    const now = await db.execute<{ agora: string }>(sql`select now()::text as agora`);
    // A tabela pode ainda não existir (antes de rodar as migrations): isso não é erro de conexão.
    const table = await db.execute<{ total: number | null }>(
      sql`select case when to_regclass('public.customers') is null then null
                 else (select count(*)::int from customers) end as total`,
    );
    return {
      ok: true,
      ms: Math.round(performance.now() - started),
      serverTime: now.rows[0]?.agora ?? "",
      customers: table.rows[0]?.total ?? null,
    };
  } catch (e) {
    // Detalhe só no log do servidor; a página não expõe mensagens internas.
    console.error("health check falhou", e);
    return { ok: false };
  }
}

export default async function SaudePage() {
  const check = await checkDatabase();
  return (
    <main className="content">
      <h1>Saúde do sistema</h1>
      <section className="panel" style={{ padding: 24, marginTop: 24 }}>
        <h2>Banco de dados (Neon Postgres)</h2>
        {check.ok ? (
          <ul style={{ marginTop: 12, lineHeight: 1.8 }}>
            <li>
              <strong>Status:</strong> conectado
            </li>
            <li>
              <strong>Tempo da consulta:</strong> {check.ms} ms
            </li>
            <li>
              <strong>Hora do servidor do banco:</strong> {check.serverTime}
            </li>
            <li>
              <strong>Tabela de clientes:</strong>{" "}
              {check.customers === null
                ? "ainda não criada (rode as migrations)"
                : `${check.customers} registro(s)`}
            </li>
          </ul>
        ) : (
          <p role="alert" style={{ marginTop: 12 }}>
            <strong>Status:</strong> sem conexão com o banco. Verifique a variável DATABASE_URL.
          </p>
        )}
      </section>
    </main>
  );
}
