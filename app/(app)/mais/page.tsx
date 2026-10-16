import type { Metadata } from "next";
import Link from "next/link";
import { Activity, ExternalLink, LogOut, MessageSquareText } from "lucide-react";

export const metadata: Metadata = { title: "Mais | Central de clientes" };

const row = { justifyContent: "flex-start", width: "100%" } as const;

// O que não é do dia a dia do dono fica aqui. O simulador é ferramenta de TESTE/demonstração
// (D56): fora do menu principal, abre em nova aba.
export default function MaisPage() {
  return (
    <>
      <div className="page-header">
        <h1>Mais</h1>
      </div>
      <ul className="stack">
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
