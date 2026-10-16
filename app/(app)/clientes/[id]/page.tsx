import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageCircle, Pencil, Phone, Sparkles } from "lucide-react";
import { getDb } from "@/db";
import { describeDue, formatDate, formatDateTime, storeDateOf, todayInStore } from "@/lib/dates";
import { formatMoney, originLabel, serviceTypeLabel, stageLabel } from "@/lib/labels";
import { whatsappMessage } from "@/lib/messages";
import { whatsappLink } from "@/lib/phone";
import { getCustomerDetail } from "@/lib/customers/queries";
import { TIMELINE_KINDS, type TimelineKind } from "@/lib/customers/timeline";
import { QuickActions } from "@/components/quick-actions";
import { AppointmentActions, QuoteActions } from "@/components/quote-actions";
import { TaskActions } from "@/components/task-actions";
import { TelegramThread } from "@/components/telegram-thread";
import { telegramThread } from "@/lib/telegram/thread";
import { oficinaLists } from "@/lib/oficina/lists";
import { QuoteRecordActions, ServiceRecordActions } from "@/components/record-actions";
import { DeleteCustomer } from "@/components/delete-customer";

export const metadata: Metadata = { title: "Ficha do cliente | Central de clientes" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/i;

export default async function FichaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tipo?: string }>;
}) {
  const { id } = await params;
  const { tipo } = await searchParams;
  if (!UUID.test(id)) notFound();
  const today = todayInStore();
  const detail = await getCustomerDetail(getDb(), id, today);
  const lists = await oficinaLists(getDb());
  const thread = detail
    ? await telegramThread(getDb(), {
        id,
        name: detail.customer.name,
        phoneE164: detail.customer.phoneE164,
      })
    : null;
  if (!detail) notFound();
  const { customer: c } = detail;
  const filter = TIMELINE_KINDS.some(([k]) => k === tipo) ? (tipo as TimelineKind) : null;
  const timeline = filter ? detail.timeline.filter((i) => i.kind === filter) : detail.timeline;

  return (
    <>
      <p style={{ marginBottom: 8 }}>
        <Link href="/clientes">← Clientes</Link>
      </p>

      <header className="card">
        <div
          style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}
        >
          <div>
            <h1>{c.name}</h1>
            <p className="muted tabular" style={{ marginTop: 4 }}>
              {c.phoneDisplay ?? "Sem telefone"} · {originLabel[c.origin]}
              {c.city ? ` · ${c.city}` : ""}
            </p>
            <p style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span className="badge">{stageLabel[c.stage]}</span>
              {c.isProvisional && (
                <span className="badge badge-agent">
                  <Sparkles aria-hidden="true" size={14} /> Criado pelo Vito: confira e salve os
                  dados
                </span>
              )}
            </p>
            {c.stage === "perdido" && c.lossReason && (
              <p className="muted" style={{ marginTop: 6 }}>
                Motivo da perda: {c.lossReason}
              </p>
            )}
          </div>
          <div className="btn-row" style={{ alignSelf: "flex-start" }}>
            {c.phoneE164 && (
              <>
                <a
                  className="btn btn-primary"
                  href={whatsappLink(c.phoneE164, whatsappMessage("outro", c.name))}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MessageCircle aria-hidden="true" size={18} /> WhatsApp
                  <span className="sr-only"> (abre em nova aba)</span>
                </a>
                <a className="btn" href={`tel:${c.phoneE164}`}>
                  <Phone aria-hidden="true" size={18} /> Ligar
                </a>
              </>
            )}
            <Link className="btn" href={`/clientes/${c.id}/editar`}>
              <Pencil aria-hidden="true" size={18} /> Editar
            </Link>
          </div>
        </div>
        {c.notes && <p style={{ marginTop: 12 }}>{c.notes}</p>}
      </header>

      {detail.pendingReviewCount > 0 && (
        <div className="banner section" role="status">
          <span>
            O Vito tem {detail.pendingReviewCount} sugestão(ões) sobre este cliente esperando sua
            decisão.
          </span>
          <Link href="/revisao" className="btn">
            Revisar
          </Link>
        </div>
      )}

      <section className="section" aria-labelledby="proximas">
        <h2 id="proximas" className="section-title">
          Próximas ações
        </h2>
        {detail.pendingTasks.length === 0 ? (
          <p className="muted">Nenhuma ação pendente.</p>
        ) : (
          <ul className="stack">
            {detail.pendingTasks.map((t) => (
              <li key={t.id} className="card">
                <p>
                  <strong>{t.title}</strong>{" "}
                  <span
                    className={
                      t.dueDate < today
                        ? "due-overdue"
                        : t.dueDate === today
                          ? "due-today"
                          : "muted"
                    }
                  >
                    · {describeDue(t.dueDate, today)} ({formatDate(t.dueDate)})
                  </span>
                </p>
                <p className="muted">{t.reason}</p>
                <TaskActions
                  taskId={t.id}
                  title={t.title}
                  customerName={c.name}
                  today={today}
                  whatsappHref={
                    c.phoneE164 ? whatsappLink(c.phoneE164, whatsappMessage(t.type, c.name)) : null
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {thread && (
        <section className="section" aria-labelledby="telegram">
          <h2 id="telegram" className="section-title">
            Conversa no Telegram
          </h2>
          <TelegramThread
            chatId={thread.chatId}
            messages={thread.messages.map((m) => ({
              id: m.id,
              author: m.author,
              text: m.text,
              when: formatDateTime(m.createdAt),
            }))}
          />
        </section>
      )}

      <section className="section" aria-labelledby="resumo">
        <h2 id="resumo" className="section-title">
          Resumo
        </h2>
        <div className="form-grid" style={{ gap: 12 }}>
          <div className="card">
            <h3>Veículos</h3>
            {detail.vehicles.length === 0 ? (
              <p className="muted">Nenhum veículo cadastrado.</p>
            ) : (
              <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                {detail.vehicles.map((v) => (
                  <li key={v.id}>
                    {v.model ?? "Veículo"}
                    {v.tireSize ? ` · pneu ${v.tireSize}` : ""}
                    {v.plate ? ` · placa ${v.plate}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="card">
            <h3>Orçamento em aberto</h3>
            {detail.openQuotes.length === 0 ? (
              <p className="muted">Nenhum orçamento aguardando resposta.</p>
            ) : (
              detail.openQuotes.map((q) => (
                <div key={q.id} style={{ marginTop: 8 }}>
                  <p>
                    <strong>{formatMoney(q.total)}</strong> · {q.description}
                  </p>
                  {q.sentAt && <p className="muted">Enviado em {formatDateTime(q.sentAt)}</p>}
                  <QuoteActions quoteId={q.id} label={q.description} />
                </div>
              ))
            )}
          </div>
          {detail.nextAppointment && (
            <div className="card">
              <h3>Próximo agendamento</h3>
              <p style={{ marginTop: 8 }}>
                {formatDateTime(detail.nextAppointment.scheduledAt)} ·{" "}
                {serviceTypeLabel[detail.nextAppointment.serviceType] ?? "Serviço"} ·{" "}
                {detail.nextAppointment.status === "agendado" ? (
                  <span className="due-today">a confirmar</span>
                ) : (
                  "confirmado"
                )}
              </p>
              <AppointmentActions
                appointmentId={detail.nextAppointment.id}
                confirmed={detail.nextAppointment.status === "confirmado"}
              />
            </div>
          )}
        </div>
      </section>

      <section className="section" aria-labelledby="registrar">
        <h2 id="registrar" className="section-title">
          Registrar
        </h2>
        <QuickActions customerId={c.id} today={today} lists={lists} />
      </section>

      <section className="section" aria-labelledby="historico">
        <h2 id="historico" className="section-title">
          Histórico
        </h2>
        <nav aria-label="Filtrar histórico" className="btn-row" style={{ marginBottom: 16 }}>
          <Link
            className="btn"
            href={`/clientes/${c.id}`}
            aria-current={!filter ? "page" : undefined}
          >
            Tudo
          </Link>
          {TIMELINE_KINDS.map(([kind, label]) => (
            <Link
              key={kind}
              className="btn"
              href={`/clientes/${c.id}?tipo=${kind}`}
              aria-current={filter === kind ? "page" : undefined}
            >
              {label}
            </Link>
          ))}
        </nav>
        {timeline.length === 0 ? (
          <p className="muted">Nada registrado{filter ? " neste filtro" : ""}.</p>
        ) : (
          <ol className="timeline">
            {timeline.map((item) => (
              <li key={item.key}>
                <p className="muted tabular">
                  <time dateTime={item.at.toISOString()}>{formatDateTime(item.at)}</time>
                  {item.upcoming ? " · em breve" : ""}
                </p>
                <p style={{ fontWeight: 650 }}>
                  {item.title}{" "}
                  {item.viaAgent && (
                    <span className="badge badge-agent">
                      <Sparkles aria-hidden="true" size={14} /> via Vito
                    </span>
                  )}
                </p>
                {item.detail && <p>{item.detail}</p>}
                {item.ref?.kind === "quote" &&
                  (() => {
                    const q = detail.quotes.find((x) => x.id === item.ref!.id);
                    return q ? <QuoteRecordActions quote={q} /> : null;
                  })()}
                {item.ref?.kind === "service" &&
                  (() => {
                    const s = detail.services.find((x) => x.id === item.ref!.id);
                    return s ? (
                      <ServiceRecordActions
                        today={today}
                        employees={lists.employees}
                        service={{
                          id: s.id,
                          type: s.type,
                          description: s.description,
                          date: storeDateOf(s.performedAt),
                          total: s.total,
                          km: s.km,
                          employeeId: s.employeeId,
                        }}
                      />
                    ) : null;
                  })()}
                {item.evidence && (
                  <details style={{ marginTop: 4 }}>
                    <summary
                      style={{
                        minHeight: 44,
                        display: "flex",
                        alignItems: "center",
                        color: "var(--accent-text)",
                        fontWeight: 600,
                      }}
                    >
                      Ver trecho da conversa
                    </summary>
                    <blockquote
                      style={{
                        margin: "4px 0 0",
                        paddingLeft: 12,
                        borderLeft: "3px solid var(--border-input)",
                      }}
                    >
                      {item.evidence}
                    </blockquote>
                  </details>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="section" aria-label="Excluir cliente">
        <DeleteCustomer id={c.id} name={c.name} />
      </section>
    </>
  );
}
