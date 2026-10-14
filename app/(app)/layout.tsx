import Link from "next/link";
import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { getDb } from "@/db";
import { hasSession } from "@/lib/auth/session";
import { pendingReviewCount } from "@/lib/customers/queries";
import { BottomNav, SidebarNav } from "@/components/nav";
import { Toaster } from "@/components/toaster";

// Layout das telas do gestor: exige sessão (além do proxy) e mostra a navegação.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!(await hasSession())) redirect("/login");
  const reviewCount = await pendingReviewCount(getDb());

  return (
    <div className="app-shell">
      <a href="#conteudo" className="skip-link">
        Pular para o conteúdo
      </a>
      <aside className="sidebar">
        <Link href="/hoje" className="brand">
          virtù<span>.</span>
        </Link>
        <SidebarNav reviewCount={reviewCount} />
        <form action="/logout" method="post" style={{ marginTop: "auto" }}>
          <button type="submit" className="btn" style={{ width: "100%" }}>
            <LogOut aria-hidden="true" size={18} /> Sair
          </button>
        </form>
      </aside>
      <div>
        <header className="topbar">
          <Link href="/hoje" className="brand">
            virtù<span>.</span>
          </Link>
          <span style={{ color: "var(--sidebar-muted)", fontWeight: 600 }}>
            Central de clientes
          </span>
        </header>
        <main id="conteudo" tabIndex={-1} className="page">
          {children}
        </main>
      </div>
      <BottomNav reviewCount={reviewCount} />
      <Toaster />
    </div>
  );
}
