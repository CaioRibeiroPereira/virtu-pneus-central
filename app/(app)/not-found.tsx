import Link from "next/link";
import { SearchX } from "lucide-react";

// Registro que não existe (ou foi apagado ao reiniciar a demonstração), dentro do menu do sistema.
export default function NaoEncontrado() {
  return (
    <section className="card" style={{ textAlign: "center", padding: 32 }}>
      <SearchX aria-hidden="true" size={40} color="var(--accent-text)" />
      <h1 style={{ marginTop: 8 }}>Não encontramos esta página</h1>
      <p className="muted" style={{ marginTop: 4 }}>
        O endereço pode estar errado ou o registro foi apagado (por exemplo, ao reiniciar a
        demonstração).
      </p>
      <div className="btn-row" style={{ justifyContent: "center", marginTop: 16 }}>
        <Link href="/hoje" className="btn btn-primary">
          Ir para Hoje
        </Link>
        <Link href="/clientes" className="btn">
          Buscar cliente
        </Link>
      </div>
    </section>
  );
}
