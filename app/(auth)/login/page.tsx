import type { Metadata } from "next";
import { safeNextPath } from "@/lib/auth/redirect";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar | Grupo Virtù Pneus" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <main className="content" style={{ maxWidth: 420, marginTop: "10vh" }}>
      <section className="panel" style={{ padding: 28 }}>
        <h1>Central de clientes</h1>
        <p className="sub" style={{ marginBottom: 24 }}>
          Grupo Virtù Pneus · área do gestor
        </p>
        <LoginForm next={safeNextPath(next)} />
      </section>
    </main>
  );
}
