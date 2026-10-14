import type { Metadata } from "next";
import { safeNextPath } from "@/lib/auth/redirect";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar | Central de clientes" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <main className="page" style={{ maxWidth: 440, paddingTop: "12vh" }}>
      <p className="brand" style={{ color: "var(--text)", marginBottom: 16 }}>
        virtù<span style={{ color: "var(--primary)" }}>.</span>
      </p>
      <section className="card" aria-labelledby="titulo">
        <h1 id="titulo">Central de clientes</h1>
        <p className="muted" style={{ margin: "4px 0 20px" }}>
          Área do gestor · Grupo Virtù Pneus
        </p>
        <LoginForm next={safeNextPath(next)} />
      </section>
    </main>
  );
}
