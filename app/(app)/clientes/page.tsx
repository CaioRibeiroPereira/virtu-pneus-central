import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Sparkles } from "lucide-react";
import { getDb } from "@/db";
import { formatDate, todayInStore } from "@/lib/dates";
import { listCustomers } from "@/lib/customers/queries";
import { options, stageLabel } from "@/lib/labels";

export const metadata: Metadata = { title: "Clientes | Central de clientes" };
export const dynamic = "force-dynamic";

type Search = { q?: string; etapa?: string; acao?: string; excluido?: string };

export default async function ClientesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const today = todayInStore();
  const items = await listCustomers(
    getDb(),
    { q: params.q, stage: params.etapa || undefined, needsAction: params.acao === "1" },
    today,
  );

  return (
    <>
      {params.excluido === "1" && (
        <p className="banner" role="status" style={{ marginBottom: 16 }}>
          Cliente excluído, com todos os dados dele (LGPD).
        </p>
      )}
      <div className="page-header">
        <h1>Clientes</h1>
        <Link href="/clientes/novo" className="btn btn-primary">
          <Plus aria-hidden="true" size={18} /> Novo cliente
        </Link>
      </div>

      {/* Formulário GET: a busca fica na URL (dá para voltar e compartilhar). */}
      <form
        className="card"
        role="search"
        aria-label="Buscar clientes"
        style={{ marginBottom: 16 }}
      >
        <div className="form-grid">
          <div className="field">
            <label htmlFor="q">Buscar</label>
            <input
              id="q"
              name="q"
              type="search"
              defaultValue={params.q}
              aria-describedby="q-hint"
              autoComplete="off"
            />
            <span id="q-hint" className="hint">
              Nome, telefone (só números) ou placa
            </span>
          </div>
          <div className="field">
            <label htmlFor="etapa">Etapa</label>
            <select id="etapa" name="etapa" defaultValue={params.etapa ?? ""}>
              <option value="">Todas as etapas</option>
              {options(stageLabel).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="btn-row" style={{ alignItems: "center", justifyContent: "space-between" }}>
          <label className="checkbox-label">
            <input type="checkbox" name="acao" value="1" defaultChecked={params.acao === "1"} />
            Só quem precisa de ação
          </label>
          <button type="submit" className="btn">
            Filtrar
          </button>
        </div>
      </form>

      <p className="muted" role="status" style={{ marginBottom: 12 }}>
        {items.length} {items.length === 1 ? "cliente encontrado" : "clientes encontrados"}
      </p>

      {items.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 32 }}>
          <p>Nenhum cliente com esses filtros.</p>
          <p className="muted" style={{ marginTop: 4 }}>
            Tente buscar só parte do nome ou do telefone.
          </p>
        </div>
      ) : (
        <>
          {/* Celular: cards. Desktop: tabela. Nenhum dos dois rola para o lado. */}
          <ul className="stack md:hidden">
            {items.map((c) => (
              <li key={c.id} className="card">
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <h2 style={{ fontSize: "1.0625rem" }}>
                    <Link href={`/clientes/${c.id}`}>{c.name}</Link>
                  </h2>
                  <span className="badge">{stageLabel[c.stage]}</span>
                </div>
                <p className="muted tabular">{c.phoneDisplay ?? "Sem telefone"}</p>
                {c.vehicle && <p className="muted">{c.vehicle}</p>}
                {c.nextAction && (
                  <p style={{ marginTop: 6 }}>
                    <span
                      className={
                        c.nextAction.dueDate < today
                          ? "due-overdue"
                          : c.nextAction.dueDate === today
                            ? "due-today"
                            : ""
                      }
                    >
                      Próxima ação: {c.nextAction.title} ({formatDate(c.nextAction.dueDate)})
                    </span>
                  </p>
                )}
                {c.isProvisional && (
                  <p style={{ marginTop: 6 }}>
                    <span className="badge badge-agent">
                      <Sparkles aria-hidden="true" size={14} /> Criado pelo Vito, confirme os dados
                    </span>
                  </p>
                )}
              </li>
            ))}
          </ul>
          <div className="card hidden md:block" style={{ padding: 0 }}>
            <table className="table">
              <caption className="sr-only">Lista de clientes</caption>
              <thead>
                <tr>
                  <th scope="col">Cliente</th>
                  <th scope="col">Telefone</th>
                  <th scope="col">Veículo</th>
                  <th scope="col">Etapa</th>
                  <th scope="col">Próxima ação</th>
                </tr>
              </thead>
              <tbody>
                {items.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/clientes/${c.id}`}>
                        <strong>{c.name}</strong>
                      </Link>
                      {c.isProvisional && (
                        <div style={{ marginTop: 4 }}>
                          <span className="badge badge-agent">
                            <Sparkles aria-hidden="true" size={14} /> Criado pelo Vito
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="tabular">{c.phoneDisplay ?? "—"}</td>
                    <td>{c.vehicle ?? "—"}</td>
                    <td>{stageLabel[c.stage]}</td>
                    <td>
                      {c.nextAction ? (
                        <span
                          className={
                            c.nextAction.dueDate < today
                              ? "due-overdue"
                              : c.nextAction.dueDate === today
                                ? "due-today"
                                : ""
                          }
                        >
                          {c.nextAction.title} ({formatDate(c.nextAction.dueDate)})
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
