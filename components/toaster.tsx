"use client";

import { Toaster as Sonner } from "sonner";

// Avisos rápidos (ex.: "Ação concluída · Desfazer"). O sonner anuncia ao leitor de tela
// por uma região aria-live.
export function Toaster() {
  return (
    <Sonner
      position="bottom-center"
      offset={88}
      toastOptions={{ style: { fontSize: "1rem" } }}
      richColors
      closeButton
    />
  );
}
