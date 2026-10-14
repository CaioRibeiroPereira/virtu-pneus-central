import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, CircleCheck, Inbox, Sparkles } from "lucide-react";
import { withTransactionalDb } from "@/db";
import { describeDue, formatDate, todayInStore } from "@/lib/dates";
import { taskTypeLabel } from "@/lib/labels";
import { whatsappMessage } from "@/lib/messages";
import { whatsappLink } from "@/lib/phone";
import { loadTodayPanel, type TodayItem, type TodayTask } from "@/lib/rules/today";
import { TaskActions } from "@/components/task-actions";

export const metadata: Metadata = { title: "Hoje | Central de clientes" };
export const dynamic = "force-dynamic";

function weekdayLabel(date: string) {
  const d = new Date(`${date}T12:00:00Z`);
  const text = d.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function TaskCard({ task, today }: { task: TodayTask & { daysOverdue: number }; today: string }) {
  const overdue = task.dueDate < today;
  const dueText = describeDue(task.dueDate, today);
  return (
    <li className="card">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <h3>
          <Link href={`/clientes/${task.customerId}`}>{task.customerName}</Link>
        </h3>
        <span className={overdue ? "due-overdue" : task.dueDate === today ? "due-today" : "muted"}>
          {dueText}
        </span>
      </div>
      <p style={{ marginTop: 4 }}>
        <strong>{task.title}</strong>
        <span className="muted"> · {taskTypeLabel[task.type] ?? "Contato"}</span>
      </p>
      <p className="muted" style={{ marginTop: 2 }}>
        {task.reason}
      </p>
      {task.viaAgent && (
        <p style={{ marginTop: 8 }}>
          <span className="badge badge-agent">
            <Sparkles aria-hidden="true" size={14} /> via Vito
          </span>
        </p>
      )}
      <TaskActions
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

function AppointmentCard({ item }: { item: Extract<TodayItem, { kind: "appointment" }> }) {
  return (
    <li className="card">
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span className="badge tabular" style={{ fontSize: "1rem" }}>
          <CalendarClock aria-hidden="true" size={16} /> {item.time}
        </span>
        <h3>
          <Link href={`/clientes/${item.customerId}`}>{item.customerName}</Link>
        </h3>
      </div>
      <p style={{ marginTop: 6 }}>
        {item.title} ·{" "}
        <span className={item.status === "agendado" ? "due-today" : "muted"}>
          {item.status === "agendado" ? "ainda não confirmado" : "confirmado"}
        </span>
      </p>
      {item.phoneE164 && (
        <div className="btn-row" style={{ marginTop: 12 }}>
          <a
            className="btn btn-primary"
            href={whatsappLink(
              item.phoneE164,
              whatsappMessage("confirmar_agendamento", item.customerName),
            )}
            target="_blank"
            rel="noopener noreferrer"
          >
            WhatsApp<span className="sr-only"> para {item.customerName} (abre em nova aba)</span>
          </a>
        </div>
      )}
    </li>
  );
}

export default async function HojePage() {
  const today = todayInStore();
  // Sincroniza as regras automáticas e monta o painel numa transação (§7.2).
  const panel = await withTransactionalDb((db) => loadTodayPanel(db, today));
  const total = panel.overdue.length + panel.dueToday.length;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Hoje</h1>
          <p className="muted" style={{ marginTop: 4 }}>
            {weekdayLabel(today)}
          </p>
        </div>
        <p className="muted">
          {total === 0
            ? "Nada pendente para hoje"
            : `${total} ${total === 1 ? "contato" : "contatos"} para fazer`}
        </p>
      </div>

      {panel.pendingReviews > 0 && (
        <div className="banner" role="status">
          <span>
            <Inbox aria-hidden="true" size={18} style={{ verticalAlign: "middle" }} /> O Vito tem{" "}
            {panel.pendingReviews} {panel.pendingReviews === 1 ? "sugestão" : "sugestões"} esperando
            sua decisão
          </span>
          <Link href="/revisao" className="btn">
            Revisar sugestões ({panel.pendingReviews})
          </Link>
        </div>
      )}

      {panel.overdue.length > 0 && (
        <section className="section" aria-labelledby="atrasados">
          <h2 id="atrasados" className="section-title">
            Atrasados <span className="badge badge-danger">{panel.overdue.length}</span>
          </h2>
          <ul className="stack">
            {panel.overdue.map((t) => (
              <TaskCard key={t.id} task={t} today={today} />
            ))}
          </ul>
        </section>
      )}

      {panel.dueToday.length > 0 && (
        <section className="section" aria-labelledby="para-hoje">
          <h2 id="para-hoje" className="section-title">
            Para hoje <span className="badge badge-warning">{panel.dueToday.length}</span>
          </h2>
          <ul className="stack">
            {panel.dueToday.map((item) =>
              item.kind === "appointment" ? (
                <AppointmentCard key={item.id} item={item} />
              ) : (
                <TaskCard key={item.id} task={item} today={today} />
              ),
            )}
          </ul>
        </section>
      )}

      {panel.allClear && (
        <section className="section card" style={{ textAlign: "center", padding: 32 }}>
          <CircleCheck aria-hidden="true" size={40} color="var(--primary)" />
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
    </>
  );
}
