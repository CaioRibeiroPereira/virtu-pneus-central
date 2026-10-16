import type { Metadata } from "next";
import Link from "next/link";
import {
  Activity,
  ExternalLink,
  LogOut,
  MessageSquareText,
  MessagesSquare,
  Package,
  UsersRound,
  Wrench,
} from "lucide-react";
import { getDb } from "@/db";
import { conversationsNeedingReply } from "@/lib/telegram/thread";

export const metadata: Metadata = { title: "Mais | Central de clientes" };

const row = { justifyContent: "flex-start", width: "100%" } as const;

// O que não é do dia a dia do dono fica aqui. O simulador é ferramenta de TESTE/demonstração
// (D56): fora do menu principal, abre em nova aba.
export const dynamic = "force-dynamic";

export default async function MaisPage() {
  const waiting = await conversationsNeedingReply(getDb());
  return (
    <>
      <div className="page-header">
        <h1>Mais</h1>
      </div>
      <ul className="stack">
        <li>
          <Link href="/conversas" className="card btn" style={row}>
            <MessagesSquare aria-hidden="true" size={20} /> Conversas (Telegram)
            {waiting > 0 && (
              <span
                className="nav-count"
                style={{ marginLeft: "auto" }}
                aria-label={`${waiting} conversas esperando resposta`}
              >
                {waiting}
              </span>
            )}
          </Link>
        </li>
        <li>
          <Link href="/estoque" className="card btn" style={row}>
            <Package aria-hidden="true" size={20} /> Estoque
          </Link>
        </li>
        <li>
          <Link href="/servicos" className="card btn" style={row}>
            <Wrench aria-hidden="true" size={20} /> Serviços e preços
          </Link>
        </li>
        <li>
          <Link href="/equipe" className="card btn" style={row}>
            <UsersRound aria-hidden="true" size={20} /> Equipe
          </Link>
        </li>
        <li>
          <Link href="/saude" className="card btn" style={row}>
            <Activity aria-hidden="true" size={20} /> Saúde do sistema
          </Link>
        </li>
        <li>
          <form action="/logout" method="post">
            <button type="submit" className="card btn" style={row}>
              <LogOut aria-hidden="true" size={20} /> Sair
            </button>
          </form>
        </li>
      </ul>

      <section className="section" aria-labelledby="ferramentas-teste">
        <h2 id="ferramentas-teste" className="section-title">
          Ferramentas de teste
        </h2>
        <p className="muted" style={{ marginBottom: 12 }}>
          Para demonstrar e testar a integração com o Vito usando conversas fictícias. Não fazem
          parte do uso diário.
        </p>
        <ul className="stack">
          <li>
            <a
              href="/simulador"
              target="_blank"
              rel="noopener noreferrer"
              className="card btn"
              style={row}
            >
              <MessageSquareText aria-hidden="true" size={20} /> Simulador de conversas (Vito)
              <ExternalLink aria-hidden="true" size={16} style={{ marginLeft: "auto" }} />
              <span className="sr-only"> (abre em nova aba)</span>
            </a>
          </li>
        </ul>
      </section>
    </>
  );
}
