import type { Metadata } from "next";
import Link from "next/link";
import { CustomerForm } from "@/components/customer-form";

export const metadata: Metadata = { title: "Novo cliente | Central de clientes" };

export default async function NovoClientePage({
  searchParams,
}: {
  searchParams: Promise<{ nome?: string; telefone?: string }>;
}) {
  // Atalho "Criar cadastro" da tela Conversas: já vem com nome e telefone do Telegram.
  const { nome, telefone } = await searchParams;
  return (
    <>
      <p style={{ marginBottom: 8 }}>
        <Link href="/clientes">← Clientes</Link>
      </p>
      <div className="page-header">
        <h1>Novo cliente</h1>
      </div>
      <CustomerForm
        mode="create"
        initial={{
          name: nome?.slice(0, 120),
          phone: telefone?.slice(0, 40),
          ...(telefone ? { origin: "outro" } : {}),
        }}
      />
    </>
  );
}
