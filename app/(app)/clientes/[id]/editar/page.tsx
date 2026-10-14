import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { customers } from "@/db/schema";
import { CustomerForm } from "@/components/customer-form";

export const metadata: Metadata = { title: "Editar cliente | Central de clientes" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/i;

export default async function EditarClientePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const [c] = await getDb().select().from(customers).where(eq(customers.id, id));
  if (!c) notFound();

  return (
    <>
      <p style={{ marginBottom: 8 }}>
        <Link href={`/clientes/${c.id}`}>← {c.name}</Link>
      </p>
      <div className="page-header">
        <h1>Editar cliente</h1>
      </div>
      <CustomerForm
        mode="edit"
        initial={{
          id: c.id,
          version: c.version,
          name: c.name,
          phone: c.phoneDisplay ?? "",
          email: c.email ?? "",
          city: c.city ?? "",
          origin: c.origin,
          stage: c.stage,
          lossReason: c.lossReason ?? "",
          notes: c.notes ?? "",
        }}
      />
    </>
  );
}
