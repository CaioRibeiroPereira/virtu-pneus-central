import type { Metadata } from "next";
import Link from "next/link";
import { Activity, LogOut, MessageSquareText } from "lucide-react";

export const metadata: Metadata = { title: "Mais | Central de clientes" };

// No celular, a barra inferior tem 4 itens; o resto fica aqui.
export default function MaisPage() {
  return (
    <>
      <div className="page-header">
        <h1>Mais</h1>
      </div>
      <ul className="stack">
        <li>
          <Link
            href="/simulador"
            className="card btn"
            style={{ justifyContent: "flex-start", width: "100%" }}
          >
            <MessageSquareText aria-hidden="true" size={20} /> Simulador de conversas (Vito)
          </Link>
        </li>
        <li>
          <Link
            href="/saude"
            className="card btn"
            style={{ justifyContent: "flex-start", width: "100%" }}
          >
            <Activity aria-hidden="true" size={20} /> Saúde do sistema
          </Link>
        </li>
        <li>
          <form action="/logout" method="post">
            <button
              type="submit"
              className="card btn"
              style={{ justifyContent: "flex-start", width: "100%" }}
            >
              <LogOut aria-hidden="true" size={20} /> Sair
            </button>
          </form>
        </li>
      </ul>
    </>
  );
}
