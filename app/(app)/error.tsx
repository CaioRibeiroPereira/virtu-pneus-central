"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";

// Falha inesperada ao montar uma tela (ex.: banco fora do ar): mensagem em português e caminho de
// volta, no lugar da página de erro padrão (em inglês). O menu continua disponível.
export default function ErroNaTela({ reset }: { error: Error; reset: () => void }) {
  return (
    <section className="card" role="alert" style={{ textAlign: "center", padding: 32 }}>
      <AlertTriangle aria-hidden="true" size={40} color="var(--danger)" />
      <h1 style={{ marginTop: 8 }}>Não foi possível carregar esta tela</h1>
      <p className="muted" style={{ marginTop: 4 }}>
        Pode ter sido a conexão. Nada do que você já salvou foi perdido.
      </p>
      <div className="btn-row" style={{ justifyContent: "center", marginTop: 16 }}>
        <button type="button" className="btn btn-primary" onClick={reset}>
          Tentar de novo
        </button>
        <Link href="/hoje" className="btn">
          Ir para Hoje
        </Link>
      </div>
    </section>
  );
}
