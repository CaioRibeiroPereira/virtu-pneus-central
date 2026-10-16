"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarCheck, Inbox, Menu, Users } from "lucide-react";

type Item = { href: string; label: string; icon: React.ElementType; count?: number };

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
export function SidebarNav({ reviewCount }: { reviewCount: number }) {
  const pathname = usePathname();
  const items: Item[] = [
    { href: "/hoje", label: "Hoje", icon: CalendarCheck },
    { href: "/clientes", label: "Clientes", icon: Users },
    { href: "/revisao", label: "Revisão", icon: Inbox, count: reviewCount },
    { href: "/mais", label: "Mais", icon: Menu },
  ];
  return (
    <nav aria-label="Menu principal">
      <ul>
        {items.map(({ href, label, icon: Icon, count }) => (
          <li key={href}>
            <Link href={href} aria-current={isActive(pathname, href) ? "page" : undefined}>
              <Icon aria-hidden="true" size={20} />
              {label}
              <CountBadge count={count} label="sugestões para revisar" />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Barra inferior (celular): os 4 destinos mais usados ao alcance do polegar. */
export function BottomNav({ reviewCount }: { reviewCount: number }) {
  const pathname = usePathname();
  const items: Item[] = [
    { href: "/hoje", label: "Hoje", icon: CalendarCheck },
    { href: "/clientes", label: "Clientes", icon: Users },
    { href: "/revisao", label: "Revisão", icon: Inbox, count: reviewCount },
    { href: "/mais", label: "Mais", icon: Menu },
  ];
  return (
    <nav aria-label="Menu principal" className="bottom-nav">
      <ul>
        {items.map(({ href, label, icon: Icon, count }) => (
          <li key={href}>
            <Link href={href} aria-current={isActive(pathname, href) ? "page" : undefined}>
              <Icon aria-hidden="true" size={22} />
              {label}
              <CountBadge count={count} label="sugestões para revisar" />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
