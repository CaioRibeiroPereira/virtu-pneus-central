import Link from "next/link";
import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { getDb } from "@/db";
import { hasSession } from "@/lib/auth/session";
import { pendingReviewCount } from "@/lib/customers/queries";
import { conversationsNeedingReply } from "@/lib/telegram/thread";
import { BottomNav, SidebarNav } from "@/components/nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { Toaster } from "@/components/toaster";

// Layout das telas do gestor: exige sessão (além do proxy) e mostra a navegação.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!(await hasSession())) redirect("/login");
  const [reviewCount, conversationCount] = await Promise.all([
    pendingReviewCount(getDb()),
    conversationsNeedingReply(getDb()),
  ]);

  return (
    <div className="app-shell">
      <a href="#conteudo" className="skip-link">
        Pular para o conteúdo
      </a>
      <aside className="sidebar">
        <Link href="/hoje" className="brand">
          virtù<span>.</span>
        </Link>
        <SidebarNav reviewCount={reviewCount} conversationCount={conversationCount} />
        <div className="sidebar-foot">
          <ThemeToggle withLabel />
          <form action="/logout" method="post">
            <button type="submit" className="btn">
              <LogOut aria-hidden="true" size={18} /> Sair
            </button>
          </form>
        </div>
      </aside>
      <div>
        <header className="topbar">
          <Link href="/hoje" className="brand">
            virtù<span>.</span>
          </Link>
          <ThemeToggle />
        </header>
        <main id="conteudo" tabIndex={-1} className="page">
          {children}
        </main>
      </div>
      <BottomNav reviewCount={reviewCount} conversationCount={conversationCount} />
      <Toaster />
    </div>
  );
}
