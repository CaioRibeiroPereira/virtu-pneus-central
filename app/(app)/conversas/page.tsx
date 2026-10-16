import type { Metadata } from "next";
import Link from "next/link";
import { MessagesSquare, UserPlus } from "lucide-react";
import { getDb } from "@/db";
import { formatDateTime } from "@/lib/dates";
import { normalizePhone } from "@/lib/phone";
import { listConversations } from "@/lib/telegram/thread";
import { TelegramThread } from "@/components/telegram-thread";

export const metadata: Metadata = { title: "Conversas | Central de clientes" };
export const dynamic = "force-dynamic";

// Todas as conversas do Telegram (D57), com ou sem cadastro: o dono vê o que o Vito respondeu
// sozinho e responde o resto. Quem ainda não é cliente ganha o atalho "Criar cadastro".
export default async function ConversasPage() {
  const conversations = await listConversations(getDb(), 10);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Conversas</h1>
          <p className="muted" style={{ marginTop: 4 }}>
            Telegram da oficina. O Vito responde sozinho só horário, endereço e o agendamento que
            está no sistema; o resto é com você.
          </p>
        </div>
      </div>

      {conversations.length === 0 && (
        <section className="card" style={{ textAlign: "center", padding: 32 }}>
          <MessagesSquare aria-hidden="true" size={40} color="var(--accent-text)" />
          <h2 style={{ marginTop: 8 }}>Nenhuma conversa ainda</h2>
          <p className="muted" style={{ marginTop: 4 }}>
            Quando um cliente escrever para o bot da oficina, a conversa aparece aqui.
          </p>
        </section>
      )}

      <ul className="stack">
        {conversations.map((c) => {
          const phone = c.phoneE164 ? normalizePhone(c.phoneE164) : null;
          const title = c.customer?.name ?? c.firstName ?? "Cliente";
          const newCustomer = `/clientes/novo?${new URLSearchParams({
            ...(c.firstName ? { nome: c.firstName } : {}),
            ...(phone ? { telefone: phone.display } : {}),
          })}`;
          return (
            <li key={c.chatId}>
              <section aria-labelledby={`conv-${c.chatId}`}>
                <div className="task-top" style={{ marginBottom: 8, flexWrap: "wrap" }}>
                  <h2 id={`conv-${c.chatId}`} style={{ fontSize: "1.0625rem" }}>
                    {c.customer ? <Link href={`/clientes/${c.customer.id}`}>{title}</Link> : title}
                  </h2>
                  <span className="muted" style={{ fontSize: "0.9375rem" }}>
                    {phone ? phone.display : "telefone ainda não compartilhado"}
                  </span>
                  {c.needsReply && <span className="pill pill-today">aguardando você</span>}
                </div>
                {!c.customer && (
                  <div className="banner" style={{ marginBottom: 10 }}>
                    <span>Ainda não é cliente cadastrado.</span>
                    {phone ? (
                      <Link href={newCustomer} className="btn">
                        <UserPlus aria-hidden="true" size={18} /> Criar cadastro
                      </Link>
                    ) : (
                      <span className="muted">O bot pediu o telefone para identificar.</span>
                    )}
                  </div>
                )}
                <TelegramThread
                  chatId={c.chatId}
                  messages={c.messages.map((m) => ({
                    id: m.id,
                    author: m.author,
                    text: m.text,
                    when: formatDateTime(m.createdAt),
                  }))}
                />
              </section>
            </li>
          );
        })}
      </ul>
    </>
  );
}
