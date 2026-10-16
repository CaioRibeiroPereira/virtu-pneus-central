"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarCheck,
  Inbox,
  Menu,
  MessagesSquare,
  Package,
  UsersRound,
  Users,
  Wrench,
} from "lucide-react";

type Item = {
  href: string;
  label: string;
  icon: React.ElementType;
  count?: number;
  countLabel?: string;
};

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function CountBadge({ count, label }: { count?: number; label: string }) {
  if (!count) return null;
  return (
    <span className="nav-count" aria-label={`${count} ${label}`}>
      {count}
    </span>
  );
}

/** Menu lateral (desktop). */
export function SidebarNav({
  reviewCount,
  conversationCount = 0,
  lowStockCount = 0,
}: {
  reviewCount: number;
  conversationCount?: number;
  lowStockCount?: number;
}) {
  const pathname = usePathname();
  const items: Item[] = [
    { href: "/hoje", label: "Hoje", icon: CalendarCheck },
    { href: "/clientes", label: "Clientes", icon: Users },
    { href: "/revisao", label: "Revisão", icon: Inbox, count: reviewCount },
    {
      href: "/conversas",
      label: "Conversas",
      icon: MessagesSquare,
      count: conversationCount,
      countLabel: "conversas esperando resposta",
    },
    {
      href: "/estoque",
      label: "Estoque",
      icon: Package,
      count: lowStockCount,
      countLabel: "produtos com estoque baixo",
    },
    { href: "/servicos", label: "Serviços", icon: Wrench },
    { href: "/equipe", label: "Equipe", icon: UsersRound },
    { href: "/mais", label: "Mais", icon: Menu },
  ];
  return (
    <nav aria-label="Menu principal">
      <ul>
        {items.map(({ href, label, icon: Icon, count, countLabel }) => (
          <li key={href}>
            <Link href={href} aria-current={isActive(pathname, href) ? "page" : undefined}>
              <Icon aria-hidden="true" size={20} />
              {label}
              <CountBadge count={count} label={countLabel ?? "sugestões para revisar"} />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Barra inferior (celular): os 4 destinos mais usados ao alcance do polegar. */
export function BottomNav({
  reviewCount,
  conversationCount = 0,
}: {
  reviewCount: number;
  conversationCount?: number;
}) {
  const pathname = usePathname();
  const items: Item[] = [
    { href: "/hoje", label: "Hoje", icon: CalendarCheck },
    { href: "/clientes", label: "Clientes", icon: Users },
    { href: "/revisao", label: "Revisão", icon: Inbox, count: reviewCount },
    {
      href: "/mais",
      label: "Mais",
      icon: Menu,
      count: conversationCount,
      countLabel: "conversas esperando resposta",
    },
  ];
  return (
    <nav aria-label="Menu principal" className="bottom-nav">
      <ul>
        {items.map(({ href, label, icon: Icon, count, countLabel }) => (
          <li key={href}>
            <Link href={href} aria-current={isActive(pathname, href) ? "page" : undefined}>
              <Icon aria-hidden="true" size={22} />
              {label}
              <CountBadge count={count} label={countLabel ?? "sugestões para revisar"} />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
