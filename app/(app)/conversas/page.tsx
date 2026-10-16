import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, MessagesSquare, UserPlus, UserRound } from "lucide-react";
import { getDb } from "@/db";
import { formatDate, formatTime, storeDateOf, todayInStore } from "@/lib/dates";
import { normalizePhone } from "@/lib/phone";
import { chatMessages, listConversations } from "@/lib/telegram/thread";
import { TelegramThread } from "@/components/telegram-thread";
import { AutoRefresh } from "@/components/auto-refresh";

export const metadata: Metadata = { title: "Conversas | Central de clientes" };
export const dynamic = "force-dynamic";

const AUTHOR_PREFIX: Record<string, string> = { gestor: "Você: ", vito: "Vito: ", cliente: "" };

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");

// Conversas do Telegram como num app de mensagens (D63): a lista à esquerda e a conversa escolhida
// à direita; no celular, a lista e a conversa ocupam a tela uma de cada vez. A escolha fica na URL
// (?chat=…): o "voltar" do celular funciona e dá para abrir uma conversa direto pelo link.
export default async function ConversasPage({
  searchParams,
}: {
  searchParams: Promise<{ chat?: string }>;
}) {
  const { chat } = await searchParams;
  const db = getDb();
  const conversations = await listConversations(db, 20);
  const today = todayInStore();
  const chosen = conversations.find((c) => c.chatId === chat) ?? null;
  // No computador, sem escolha, abre a mais recente; no celular a lista aparece primeiro.
  const open = chosen ?? conversations[0] ?? null;
  const messages = open ? await chatMessages(db, open.chatId) : [];

  if (!conversations.length) {
    return (
      <>
        <h1 style={{ marginBottom: 16 }}>Conversas</h1>
        <section className="card" style={{ textAlign: "center", padding: 32 }}>
          <MessagesSquare aria-hidden="true" size={40} color="var(--accent-text)" />
          <h2 style={{ marginTop: 8 }}>Nenhuma conversa ainda</h2>
          <p className="muted" style={{ marginTop: 4 }}>
            Quando um cliente escrever para o bot da oficina no Telegram, a conversa aparece aqui.
          </p>
        </section>
      </>
    );
  }

  // "Contato (19) …" é o rótulo do cadastro provisório criado pelo Vito: o nome do Telegram é melhor.
  const title = (c: (typeof conversations)[number]) =>
    c.customer && !c.customer.name.startsWith("Contato ")
      ? c.customer.name
      : (c.firstName ?? c.customer?.name ?? "Cliente");
  // Hora como nos apps: só "14:52" se for hoje; senão "15/10 14:52".
  const stamp = (at: Date) =>
    storeDateOf(at) === today
      ? formatTime(at)
      : `${formatDate(storeDateOf(at)).slice(0, 5)} ${formatTime(at)}`;
  const openPhone = open?.phoneE164 ? normalizePhone(open.phoneE164) : null;
  const newCustomer =
    open &&
    `/clientes/novo?${new URLSearchParams({
      ...(open.firstName ? { nome: open.firstName } : {}),
      ...(openPhone ? { telefone: openPhone.display } : {}),
    })}`;

  return (
    <div className="inbox" data-open={chosen ? "true" : undefined}>
      <AutoRefresh />
      <section className="inbox-list card" aria-labelledby="conversas-titulo">
        <h1 id="conversas-titulo" className="inbox-title">
          Conversas
        </h1>
        <p className="muted inbox-hint">
          Telegram da oficina. O Vito responde sozinho horário, endereço e agendamento; o resto é
          com você.
        </p>
        <ul className="inbox-items">
          {conversations.map((c) => {
            const last = c.messages.at(-1);
            const when = last
              ? storeDateOf(last.createdAt) === today
                ? formatTime(last.createdAt)
                : formatDate(storeDateOf(last.createdAt)).slice(0, 5)
              : "";
            return (
              <li key={c.chatId}>
                <Link
                  href={`/conversas?chat=${c.chatId}`}
                  className={`inbox-item${open?.chatId === c.chatId ? " is-open" : ""}`}
                  aria-current={chosen?.chatId === c.chatId ? "page" : undefined}
                >
                  <span className="avatar" aria-hidden="true">
                    {initials(title(c))}
                  </span>
                  <span className="inbox-item-body">
                    <span className="inbox-item-top">
                      <strong className="inbox-name">{title(c)}</strong>
                      <span className="inbox-when tabular">{when}</span>
                    </span>
                    <span className="inbox-preview">
                      {last ? `${AUTHOR_PREFIX[last.author] ?? ""}${last.text}` : "Sem mensagens"}
                    </span>
                  </span>
                  {c.needsReply && (
                    <span className="inbox-dot" title="Aguardando você">
                      <span className="sr-only">aguardando você</span>
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {open && (
        <section className="inbox-chat card" aria-labelledby="conversa-aberta">
          <header className="inbox-chat-header">
            <Link href="/conversas" className="btn inbox-back" aria-label="Voltar para a lista">
              <ArrowLeft aria-hidden="true" size={18} />
            </Link>
            <span className="avatar" aria-hidden="true">
              {initials(title(open))}
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <h2 id="conversa-aberta" className="inbox-chat-name">
                {title(open)}
              </h2>
              <p className="muted inbox-chat-sub">
                {openPhone ? openPhone.display : "telefone ainda não compartilhado"}
                {open.needsReply && <span className="pill pill-today">aguardando você</span>}
              </p>
            </div>
            {open.customer ? (
              <Link href={`/clientes/${open.customer.id}`} className="btn">
                <UserRound aria-hidden="true" size={18} />
                <span className="wide-only">Abrir ficha</span>
                <span className="sr-only"> de {title(open)}</span>
              </Link>
            ) : openPhone ? (
              <Link href={newCustomer!} className="btn">
                <UserPlus aria-hidden="true" size={18} />
                <span className="wide-only">Criar cadastro</span>
                <span className="sr-only"> de {title(open)}</span>
              </Link>
            ) : null}
          </header>
          {!open.customer && !openPhone && (
            <p className="muted inbox-note">O bot pediu o telefone para identificar o cliente.</p>
          )}
          <TelegramThread
            key={open.chatId}
            variant="app"
            chatId={open.chatId}
            messages={messages.map((m) => ({
              id: m.id,
              author: m.author,
              text: m.text,
              when: stamp(m.createdAt),
            }))}
          />
        </section>
      )}
    </div>
  );
}
