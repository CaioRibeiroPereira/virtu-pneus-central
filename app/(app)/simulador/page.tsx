import type { Metadata } from "next";

export const metadata: Metadata = { title: "Simulador | Central de clientes" };

// Provisório: implementado na Fase 4 (docs/PLANO_DESENVOLVIMENTO.md §9).
export default function Page() {
  return (
    <>
      <div className="page-header">
        <h1>Simulador</h1>
      </div>
      <p className="card">O simulador de conversas do Vito chega na Fase 4.</p>
    </>
  );
}
