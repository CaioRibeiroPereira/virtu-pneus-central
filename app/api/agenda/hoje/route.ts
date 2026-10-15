import { withTransactionalDb } from "@/db";
import { publicAppUrl } from "@/lib/app-url";
import { bearerMatches } from "@/lib/auth/token";
import { todayInStore } from "@/lib/dates";
import { buildDigest } from "@/lib/rules/digest";
import { loadTodayPanel } from "@/lib/rules/today";

// Resumo do painel "Hoje" para o workflow de resumo diário do n8n (§8.5, §12.2). Mesmo token dos
// agentes. Traz as contagens, os itens e a mensagem pronta para o Telegram (lib/rules/digest.ts).
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!bearerMatches(request.headers.get("authorization"), process.env.AGENT_API_TOKEN)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const panel = await withTransactionalDb((db) => loadTodayPanel(db, todayInStore()));
  return Response.json(buildDigest(panel, publicAppUrl()));
}
