import Link from "next/link";

// Endereço que não existe no sistema (fora das telas do gestor).
export default function NaoEncontrado() {
  return (
    <main className="page" style={{ maxWidth: 480, paddingTop: "12vh", textAlign: "center" }}>
      <section className="card" style={{ padding: 32 }}>
        <h1>Página não encontrada</h1>
        <p className="muted" style={{ marginTop: 4 }}>
          Confira o endereço ou volte para o início.
        </p>
        <Link href="/hoje" className="btn btn-primary" style={{ marginTop: 16 }}>
          Ir para Hoje
        </Link>
      </section>
    </main>
  );
}
