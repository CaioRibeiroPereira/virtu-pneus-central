import type { Metadata } from "next";
import { getDb } from "@/db";
import { formatMoney, serviceTypeLabel } from "@/lib/labels";
import { listCatalog } from "@/lib/oficina/team";
import { CatalogForm } from "@/components/oficina-forms";

export const metadata: Metadata = { title: "Serviços | Central de clientes" };
export const dynamic = "force-dynamic";

// Tabela de serviços e preços (D58): usada no "Usar da tabela de serviços" dos orçamentos e
// serviços da ficha.
export default async function ServicosPage() {
  const catalog = await listCatalog(getDb());
  return (
    <>
      <div className="page-header">
        <div>
          <h1>Serviços</h1>
          <p className="muted" style={{ marginTop: 4 }}>
            Tabela de serviços e preços da oficina. Na ficha do cliente, “Usar da tabela de
            serviços” preenche o orçamento ou o serviço com estes valores.
          </p>
        </div>
      </div>
      <CatalogForm />
      <ul className="stack section">
        {catalog.map((c) => (
          <li key={c.id} className="card">
            <div className="task-top">
              <h2 style={{ fontSize: "1.0625rem" }}>{c.name}</h2>
              <span className="pill tag-agent">{formatMoney(c.price)}</span>
            </div>
            <p className="muted" style={{ marginTop: 6 }}>
              {serviceTypeLabel[c.type] ?? c.type}
              {c.durationMinutes ? ` · cerca de ${c.durationMinutes} min` : ""}
              {!c.active && " · inativo (não aparece na ficha)"}
            </p>
            <div style={{ marginTop: 10 }}>
              <CatalogForm
                item={{
                  id: c.id,
                  name: c.name,
                  type: c.type,
                  price: c.price,
                  durationMinutes: c.durationMinutes,
                  active: c.active,
                }}
              />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
