import type { Metadata } from "next";
import Link from "next/link";
import { CustomerForm } from "@/components/customer-form";

export const metadata: Metadata = { title: "Novo cliente | Central de clientes" };

export default function NovoClientePage() {
  return (
    <>
      <p style={{ marginBottom: 8 }}>
        <Link href="/clientes">← Clientes</Link>
      </p>
      <div className="page-header">
        <h1>Novo cliente</h1>
      </div>
      <CustomerForm mode="create" />
    </>
  );
}
