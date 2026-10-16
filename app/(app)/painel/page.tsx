import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  ClipboardList,
  Hourglass,
  Package,
  Percent,
  ThumbsDown,
  Wrench,
} from "lucide-react";
import { getDb } from "@/db";
import { addDays, formatDate, todayInStore } from "@/lib/dates";
import { formatMoney, serviceTypeLabel, stageLabel } from "@/lib/labels";
import { loadDashboard, PERIODS, type Period } from "@/lib/finance/dashboard";

export const metadata: Metadata = { title: "Painel | Central de clientes" };
export const dynamic = "force-dynamic";

/** "12,3 mil" em cima das barras (cabe no celular); o valor exato vai para o leitor de tela. */
const short = (n: number) =>
  n >= 1000
    ? `${(n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`
    : n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });

function Delta({ value, label }: { value: number | null; label: string }) {
  if (value === null) return <p className="kpi-note">sem base para comparar</p>;
  const up = value >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <p className={`kpi-note ${up ? "delta-up" : "delta-down"}`}>
      <Icon aria-hidden="true" size={16} />
      {up ? "+" : ""}
      {value}% {label}
    </p>
  );
}

function Kpi({
  icon: Icon,
  title,
  value,
  children,
}: {
  icon: React.ElementType;
  title: string;
  value: string;
  children?: React.ReactNode;
}) {
  return (
    <li className="card kpi">
      <p className="kpi-title">
        <Icon aria-hidden="true" size={18} /> {title}
      </p>
      <p className="kpi-value tabular">{value}</p>
      {children}
    </li>
  );
}

export default async function PainelPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  const { periodo } = await searchParams;
  const period: Period = PERIODS.some(([id]) => id === periodo) ? (periodo as Period) : "mes";
  const today = todayInStore();
  const d = await loadDashboard(getDb(), period, today);
  const periodLabel = PERIODS.find(([id]) => id === period)![1];
  const vsLabel = period === "ano" ? "vs. ano passado" : "vs. período anterior";
  const maxMonth = Math.max(1, ...d.byMonth.map((m) => m.total));
  const maxType = Math.max(1, ...d.byType.map((t) => t.total));
  const top = Math.max(1, d.funnel[0].reached);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Painel</h1>
          <p className="muted" style={{ marginTop: 4 }}>
            Dinheiro e funil de vendas · {formatDate(d.range.start)} a{" "}
            {formatDate(addDays(d.range.end, -1))}
          </p>
        </div>
        <Link href="/hoje" className="btn btn-brand">
          Ver o que fazer hoje
        </Link>
      </div>

      <nav aria-label="Período">
        <ul className="chips">
          {PERIODS.map(([id, label]) => (
            <li key={id}>
              <Link
                href={id === "mes" ? "/painel" : `/painel?periodo=${id}`}
                className="chip"
                aria-current={id === period ? "page" : undefined}
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <section className="section" aria-labelledby="numeros">
        <h2 id="numeros" className="sr-only">
          Números de {periodLabel.toLowerCase()}
        </h2>
        <ul className="kpis">
          <Kpi icon={Banknote} title="Faturamento" value={formatMoney(d.revenue.total)}>
            <Delta value={d.revenue.change} label={vsLabel} />
          </Kpi>
          <Kpi icon={Wrench} title="Serviços feitos" value={String(d.services.count)}>
            <p className="kpi-note">
              Ticket médio:{" "}
              {d.services.averageTicket === null ? "—" : formatMoney(d.services.averageTicket)}
            </p>
          </Kpi>
          <Kpi icon={ClipboardList} title="Orçamentos enviados" value={String(d.quotesSent.count)}>
            <p className="kpi-note">{formatMoney(d.quotesSent.total)} orçados</p>
          </Kpi>
          <Kpi
            icon={Percent}
            title="Aprovação de orçamentos"
            value={d.approval.rate === null ? "—" : `${d.approval.rate}%`}
          >
            <p className="kpi-note">
              {d.approval.approved} de {d.approval.decided} decididos ·{" "}
              {formatMoney(d.approval.approvedTotal)}
            </p>
          </Kpi>
          <Kpi icon={Hourglass} title="Em aberto agora" value={formatMoney(d.open.total)}>
            <p className="kpi-note">
              {d.open.count} {d.open.count === 1 ? "orçamento esperando" : "orçamentos esperando"} ·{" "}
              <Link href="/hoje?filtro=orcamentos">cobrar</Link>
            </p>
          </Kpi>
          <Kpi icon={ThumbsDown} title="Perdido em recusas" value={formatMoney(d.lost.total)}>
            <p className="kpi-note">
              {d.lost.count} {d.lost.count === 1 ? "orçamento recusado" : "orçamentos recusados"}
            </p>
          </Kpi>
          <Kpi icon={Package} title="Mercadoria em estoque" value={formatMoney(d.stockValue)}>
            <p className="kpi-note">
              <Link href="/estoque">ver estoque</Link>
            </p>
          </Kpi>
        </ul>
      </section>

      <div className="dash-grid">
        <section className="card section" aria-labelledby="funil">
          <h2 id="funil" className="section-title">
            Funil de vendas
          </h2>
          <p className="muted" style={{ marginBottom: 12 }}>
            Quantos clientes chegaram a cada etapa (hoje). Toque numa etapa para ver os clientes.
          </p>
          <ol className="funnel">
            {d.funnel.map((step) => (
              <li key={step.stage}>
                <Link href={`/clientes?etapa=${step.stage}`} className="funnel-row">
                  <span className="funnel-label">{stageLabel[step.stage]}</span>
                  <span className="funnel-track" aria-hidden="true">
                    <span
                      className="funnel-bar"
                      style={{ width: `${Math.max(4, (step.reached / top) * 100)}%` }}
                    />
                  </span>
                  <span className="funnel-num tabular">
                    <strong>{step.reached}</strong>
                    {step.conversion !== null && (
                      <span className="muted"> · {step.conversion}% da etapa anterior</span>
                    )}
                  </span>
                </Link>
                <p className="muted funnel-detail">
                  {step.here} {step.here === 1 ? "está" : "estão"} nesta etapa
                  {step.openValue > 0 && ` · ${formatMoney(step.openValue)} em orçamentos abertos`}
                </p>
              </li>
            ))}
          </ol>
          <p style={{ marginTop: 12 }}>
            <Link href="/clientes?etapa=perdido">
              {d.lostCustomers} {d.lostCustomers === 1 ? "cliente perdido" : "clientes perdidos"}
            </Link>
          </p>
        </section>

        <section className="card section" aria-labelledby="meses">
          <h2 id="meses" className="section-title">
            Faturamento nos últimos 6 meses (R$)
          </h2>
          <ol className="month-chart">
            {d.byMonth.map((m) => (
              <li key={m.month}>
                <span className="month-value tabular" aria-hidden="true">
                  {short(m.total)}
                </span>
                <span className="month-track" aria-hidden="true">
                  <span
                    className="month-bar"
                    style={{ height: `${Math.max(2, (m.total / maxMonth) * 100)}%` }}
                  />
                </span>
                <span className="month-label">
                  {m.label}
                  <span className="sr-only">: {formatMoney(m.total)}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section className="card section" aria-labelledby="tipos">
          <h2 id="tipos" className="section-title">
            Faturamento por serviço · {periodLabel.toLowerCase()}
          </h2>
          {d.byType.length === 0 ? (
            <p className="muted">Nenhum serviço registrado no período.</p>
          ) : (
            <ul className="hbars">
              {d.byType.map((t) => (
                <li key={t.type}>
                  <span className="hbar-label">
                    {serviceTypeLabel[t.type] ?? t.type}
                    <strong className="tabular">{formatMoney(t.total)}</strong>
                  </span>
                  <span className="hbar-track" aria-hidden="true">
                    <span className="hbar" style={{ width: `${(t.total / maxType) * 100}%` }} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card section" aria-labelledby="perdas">
          <h2 id="perdas" className="section-title">
            Por que perdemos · {periodLabel.toLowerCase()}
          </h2>
          {d.lossReasons.length === 0 ? (
            <p className="muted">Nenhum orçamento recusado no período.</p>
          ) : (
            <ul className="stack" style={{ gap: 8 }}>
              {d.lossReasons.map((r) => (
                <li key={r.reason} className="loss-row">
                  <span>{r.reason}</span>
                  <span className="muted tabular">
                    {r.count}× · {formatMoney(r.total)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
