import { getDb } from "@/db";
import { bearerMatches } from "@/lib/auth/token";
import { markExtracted } from "@/lib/telegram/conversations";

// Para o n8n (D57): confirma que o lote foi enviado à extração.
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ chatId: string }> }) {
  if (!bearerMatches(request.headers.get("authorization"), process.env.AGENT_API_TOKEN)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const { chatId } = await params;
  const body = (await request.json().catch(() => null)) as { ate?: unknown } | null;
  const ate = typeof body?.ate === "string" ? new Date(body.ate) : null;
  if (!/^\d{1,20}$/.test(chatId) || !ate || Number.isNaN(ate.getTime())) {
    return Response.json({ error: "invalid_request" }, { status: 422 });
  }
  return Response.json({ marcadas: await markExtracted(getDb(), chatId, ate) });
}
