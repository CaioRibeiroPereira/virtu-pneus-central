"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Atualiza a tela de tempos em tempos (só com a aba visível): mensagem nova aparece sozinha. */
export function AutoRefresh({ seconds = 15 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
