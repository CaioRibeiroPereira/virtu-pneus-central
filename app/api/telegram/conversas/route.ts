import { getDb } from "@/db";
import { bearerMatches } from "@/lib/auth/token";
import { readyConversations } from "@/lib/telegram/conversations";

// Para o n8n (D57): conversas do Telegram prontas para a extração. Mesmo token dos agentes.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!bearerMatches(request.headers.get("authorization"), process.env.AGENT_API_TOKEN)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  return Response.json({ conversas: await readyConversations(getDb()) });
}
