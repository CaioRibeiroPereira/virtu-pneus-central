// Dados fixos da oficina usados nas respostas automáticas do Telegram (D57). Vêm do ambiente;
// os padrões são claramente fictícios — o sistema não publica um endereço inventado como real.
import type { ShopInfo } from "@/lib/telegram/autoreply";

export function shopInfo(env: NodeJS.ProcessEnv = process.env): ShopInfo {
  return {
    name: env.SHOP_NAME || "Virtù Pneus",
    address:
      env.SHOP_ADDRESS || "Rua Exemplo, 100 — Campinas/SP (endereço fictício da demonstração)",
    hours: env.SHOP_HOURS || "segunda a sexta, das 8h às 18h; sábado, das 8h às 12h",
  };
}
