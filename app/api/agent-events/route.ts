import { withTransactionalDb } from "@/db";
import { handleAgentEvent, thresholdFromEnv } from "@/lib/agent/handler";

// Porta de entrada dos agentes de IA (n8n e simulador). Autenticação por token próprio
// (Authorization: Bearer), não pela sessão do gestor. Detalhes em lib/agent/.
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const result = await handleAgentEvent(
    {
      authorization: request.headers.get("authorization"),
      contentType: request.headers.get("content-type"),
      body: await request.text(),
    },
    {
      token: process.env.AGENT_API_TOKEN,
      threshold: thresholdFromEnv(process.env.AGENT_AUTO_APPLY_THRESHOLD),
      withDb: withTransactionalDb,
    },
  );
  return Response.json(result.body, { status: result.status });
}
