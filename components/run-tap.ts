import { toast } from "sonner";
import type { TapResult } from "@/app/(app)/actions";

/**
 * Roda um botão de 1 toque (concluir, adiar, aprovar orçamento…). Uma recusa da regra vira aviso;
 * uma falha inesperada (sem internet, servidor fora) também — a tela continua de pé.
 * Devolve o resultado só quando deu certo.
 */
export async function runTap(call: () => Promise<TapResult>): Promise<TapResult | null> {
  try {
    const result = await call();
    if (!result.ok) toast.error(result.message);
    return result.ok ? result : null;
  } catch {
    toast.error("Não foi possível salvar agora. Confira a conexão e tente de novo.");
    return null;
  }
}
