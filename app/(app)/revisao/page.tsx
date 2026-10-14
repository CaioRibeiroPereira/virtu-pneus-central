import type { Metadata } from "next";

export const metadata: Metadata = { title: "Revisão | Central de clientes" };

// Provisório: implementado na Fase 4 (docs/PLANO_DESENVOLVIMENTO.md §9).
export default function Page() {
  return (
    <>
      <div className="page-header">
        <h1>Revisão</h1>
      </div>
      <p className="card">A fila de revisão das sugestões do Vito chega na Fase 4.</p>
    </>
  );
}
