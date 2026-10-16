"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

// Tema claro/escuro (T10). O tema inicial é aplicado antes da pintura pelo script do <head>
// (app/layout.tsx); este botão só troca e salva a escolha no navegador.
export const THEME_KEY = "tema";

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}
const currentTheme = () => document.documentElement.dataset.theme ?? "light";

export function ThemeToggle({ withLabel = false }: { withLabel?: boolean }) {
  const theme = useSyncExternalStore(subscribe, currentTheme, () => "light");
  const dark = theme === "dark";
  const label = dark ? "Modo claro" : "Modo escuro";

  function toggle() {
    const next = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // armazenamento bloqueado: o tema vale só nesta visita
    }
  }

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-label={withLabel ? undefined : `Mudar para o ${label.toLowerCase()}`}
    >
      {dark ? <Sun aria-hidden="true" size={18} /> : <Moon aria-hidden="true" size={18} />}
      {withLabel && label}
    </button>
  );
}
