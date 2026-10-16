import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  CalendarClock,
  CircleCheck,
  Clock,
  MessageCircle,
  Plus,
  Sparkles,
  Wallet,
} from "lucide-react";
import { withTransactionalDb } from "@/db";
import { formatDate, formatLongDate, todayInStore } from "@/lib/dates";
import { taskTypeLabel } from "@/lib/labels";
import { whatsappMessage } from "@/lib/messages";
import { whatsappLink } from "@/lib/phone";
import { loadTodayExtras } from "@/lib/rules/today-extras";
import { loadTodayPanel, type TodayItem, type TodayTask } from "@/lib/rules/today";
import { TaskActions } from "@/components/task-actions";

export const metadata: Metadata = { title: "Hoje | Central de clientes" };
export const dynamic = "force-dynamic";

type Task = TodayTask & { daysOverdue: number };
type Appointment = Extract<TodayItem, { kind: "appointment" }>;

/** Filtros da tela (pílulas); vêm da URL (?filtro=), funcionam sem JavaScript. */
const FILTERS = [
  { id: "tudo", label: "Tudo", match: () => true },
  { id: "atrasados", label: "Atrasados", match: (t: Task) => t.daysOverdue > 0 },
  { id: "orcamentos", label: "Orçamentos", match: (t: Task) => t.type === "followup_orcamento" },
  { id: "pos-venda", label: "Pós-venda", match: (t: Task) => t.type === "pos_venda" },
  { id: "retornos", label: "Retornos", match: (t: Task) => t.type === "retorno_comercial" },
] as const;

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");

/** "Bom dia" / "Boa tarde" / "Boa noite" no horário da loja. */
function greeting(now = new Date()) {
  const hour = Number(
    new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(now),
  );
  return hour < 12 ? "Bom dia!" : hour < 18 ? "Boa tarde!" : "Boa noite!";
}

function TaskCard({ task }: { task: Task }) {
  const overdue = task.daysOverdue > 0;
  return (
    <li className="card">
      <div className="task-top">
        <span className="avatar" aria-hidden="true">
          {initials(task.customerName)}
        </span>
        <h3>
          <Link href={`/clientes/${task.customerId}`}>{task.customerName}</Link>
        </h3>
        <span className={`pill ${overdue ? "pill-overdue" : "pill-today"}`}>
          {overdue ? `há ${task.daysOverdue} ${task.daysOverdue === 1 ? "dia" : "dias"}` : "hoje"}
        </span>
      </div>
      <p style={{ marginTop: 10, fontWeight: 700 }}>{task.title}</p>
      <p className="muted" style={{ marginTop: 2 }}>
        {task.reason}
      </p>
      <div className="tags">
        <span className="tag">{taskTypeLabel[task.type] ?? "Contato"}</span>
        {task.viaAgent && (
          <span className="tag tag-agent">
            <Sparkles aria-hidden="true" size={13} /> via Vito
          </span>
        )}
      </div>
      <TaskActions
        compact
        taskId={task.id}
        title={task.title}
        customerName={task.customerName}
        whatsappHref={
          task.phoneE164
            ? whatsappLink(task.phoneE164, whatsappMessage(task.type, task.customerName))
            : null
        }
      />
    </li>
  );
}

function AgendaPanel({ items }: { items: Appointment[] }) {
  return (
    <section className="card panel" aria-labelledby="agenda-hoje">
      <h2 id="agenda-hoje">
        <CalendarClock aria-hidden="true" size={19} /> Agenda de hoje
      </h2>
      {items.length === 0 && <p className="muted">Nenhum horário marcado hoje.</p>}
      {items.map((a) => (
        <div key={a.id} className="appt">
          <span className="appt-time tabular">{a.time}</span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <Link
              href={`/clientes/${a.customerId}`}
              style={{ color: "var(--text)", fontWeight: 800 }}
            >
              {a.customerName}
            </Link>
            <p className="muted" style={{ fontSize: "0.9375rem" }}>
              {a.title} ·{" "}
              {a.status === "agendado" ? (
                <span className="due-today">ainda não confirmado</span>
              ) : (
                "confirmado"
              )}
            </p>
          </div>
          {a.phoneE164 && (
            <a
              className="btn btn-primary"
              href={whatsappLink(
                a.phoneE164,
                whatsappMessage("confirmar_agendamento", a.customerName),
              )}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle aria-hidden="true" size={19} />
              <span className="sr-only">WhatsApp para {a.customerName} (abre em nova aba)</span>
            </a>
          )}
        </div>
      ))}
    </section>
  );
}

export default async function HojePage({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string }>;
}) {
  const { filtro } = await searchParams;
  const today = todayInStore();
  // Sincroniza as regras automáticas e monta o painel numa transação (§7.2).
  const [panel, extras] = await withTransactionalDb(async (db) => {
    const p = await loadTodayPanel(db, today);
    return [p, await loadTodayExtras(db, today)] as const;
  });

  const appointments = panel.dueToday.filter((i): i is Appointment => i.kind === "appointment");
  const todayTasks = panel.dueToday.filter((i): i is Task => i.kind === "task");
  const allTasks = [...panel.overdue, ...todayTasks];
  const pending = allTasks.length + appointments.length;
  const done = extras.doneToday;
  const progress = done + pending ? Math.round((done / (done + pending)) * 100) : 100;

  const active = FILTERS.find((f) => f.id === filtro) ?? FILTERS[0];
  const overdue = panel.overdue.filter(active.match);
  const forToday = todayTasks.filter(active.match);

  return (
    <div className="today-grid">
      <div style={{ minWidth: 0 }}>
        <section className="hero" aria-labelledby="saudacao">
          <div
            className="ring"
            style={{ "--p": progress } as React.CSSProperties}
            role="img"
            aria-label={`${done} de ${done + pending} contatos feitos hoje`}
          >
            <span aria-hidden="true">
              {done}/{done + pending}
            </span>
          </div>
          <div className="hero-text">
            <h1 id="saudacao">{greeting()}</h1>
            <p>
              {formatLongDate(today)}.{" "}
              {pending === 0
                ? "Nada pendente para hoje."
                : `${pending} ${pending === 1 ? "contato" : "contatos"} para fazer${
                    panel.overdue.length ? ` — ${panel.overdue.length} já atrasados` : ""
                  }.`}
            </p>
          </div>
          <Link href="/clientes/novo" className="btn btn-brand">
            <Plus aria-hidden="true" size={19} /> Novo cliente
          </Link>
        </section>

        {allTasks.length > 0 && (
          <nav aria-label="Filtrar ações">
            <ul className="chips">
              {FILTERS.map((f) => {
                const n = allTasks.filter(f.match).length;
                if (f.id !== "tudo" && n === 0) return null;
                return (
                  <li key={f.id}>
                    <Link
                      href={f.id === "tudo" ? "/hoje" : `/hoje?filtro=${f.id}`}
                      className="chip"
                      aria-current={f.id === active.id ? "page" : undefined}
                    >
                      {f.label}
                      <span className="n">{n}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        )}

        {overdue.length > 0 && (
          <section className="section" aria-labelledby="atrasados">
            <h2 id="atrasados" className="section-title">
              <AlertTriangle aria-hidden="true" size={19} /> Atrasados{" "}
              <span className="badge badge-danger">{overdue.length}</span>
            </h2>
            <ul className="stack">
              {overdue.map((t) => (
                <TaskCard key={t.id} task={t} />
              ))}
            </ul>
          </section>
        )}

        {forToday.length > 0 && (
          <section className="section" aria-labelledby="para-hoje">
            <h2 id="para-hoje" className="section-title">
              <Clock aria-hidden="true" size={19} /> Para hoje{" "}
              <span className="badge badge-warning">{forToday.length}</span>
            </h2>
            <ul className="stack">
              {forToday.map((t) => (
                <TaskCard key={t.id} task={t} />
              ))}
            </ul>
          </section>
        )}

        {allTasks.length > 0 && overdue.length + forToday.length === 0 && (
          <p className="section muted">
            Nenhuma ação deste tipo. <Link href="/hoje">Ver tudo</Link>
          </p>
        )}

        {panel.allClear && (
          <section className="section card" style={{ textAlign: "center", padding: 32 }}>
            <CircleCheck aria-hidden="true" size={40} color="var(--accent-text)" />
            <h2 style={{ marginTop: 8 }}>Tudo em dia!</h2>
            <p className="muted" style={{ marginTop: 4 }}>
              Nenhum contato atrasado nem para hoje.
            </p>
          </section>
        )}

        {panel.upcoming.length > 0 && (
          <section className="section">
            <details className="disclosure">
              <summary>
                <h2 className="section-title" style={{ margin: 0 }}>
                  Próximos 7 dias <span className="badge">{panel.upcoming.length}</span>
                </h2>
              </summary>
              <ul className="stack" style={{ marginTop: 12 }}>
                {panel.upcoming.map((t) => (
                  <li key={t.id} className="card">
                    <p>
                      <Link href={`/clientes/${t.customerId}`}>
                        <strong>{t.customerName}</strong>
                      </Link>{" "}
                      · {t.title}
                    </p>
                    <p className="muted">
                      {formatDate(t.dueDate)} · {t.reason}
                    </p>
                  </li>
                ))}
              </ul>
            </details>
          </section>
        )}
      </div>

      <aside className="today-side" aria-label="Resumo do dia">
        <AgendaPanel items={appointments} />

        {panel.pendingReviews > 0 && (
          <section className="card panel panel-vito" aria-labelledby="vito-revisao">
            <h2 id="vito-revisao">
              <Sparkles aria-hidden="true" size={19} /> Vito precisa de você
            </h2>
            <p>
              {panel.pendingReviews}{" "}
              {panel.pendingReviews === 1 ? "sugestão esperando" : "sugestões esperando"} sua
              decisão:
            </p>
            <ul>
              {extras.reviewSummaries.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
            <Link href="/revisao" className="btn btn-brand">
              Revisar agora ({panel.pendingReviews})
            </Link>
          </section>
        )}

        {extras.staleQuotes.count > 0 && (
          <section className="card panel" aria-labelledby="orcamentos-parados">
            <h2 id="orcamentos-parados">
              <Wallet aria-hidden="true" size={19} /> Orçamentos parados
            </h2>
            <p className="muted">
              {extras.staleQuotes.count} aguardando resposta ·{" "}
              {brl.format(extras.staleQuotes.total)} no total
            </p>
            <Link href="/hoje?filtro=orcamentos" style={{ display: "inline-block", marginTop: 8 }}>
              Ver orçamentos
            </Link>
          </section>
        )}
      </aside>
    </div>
  );
}
