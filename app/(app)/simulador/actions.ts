"use server";

// Ações do simulador. Os eventos vão para o MESMO endpoint que o n8n usa (POST /api/agent-events),
// por uma requisição HTTP feita no servidor: o token dos agentes nunca chega ao navegador.
import { revalidatePath } from "next/cache";
import { handleAgentEvent, thresholdFromEnv } from "@/lib/agent/handler";
import { withTransactionalDb } from "@/db";
import { resetDemoData } from "@/db/reset";
import { requireSession } from "@/lib/auth/session";
import { todayInStore } from "@/lib/dates";
import { buildPresetEvents } from "@/lib/simulator/presets";

export type SendResult = {
  eventId: string;
  type: string;
  httpStatus: number;
  body: Record<string, unknown>;
};

/**
 * Endereço do endpoint vindo só de fontes confiáveis. NÃO usa o cabeçalho Host da requisição:
 * alguém poderia forjá-lo e fazer o servidor mandar o token dos agentes para outro site (SSRF).
 * Produção: domínio informado pela própria Vercel. Local: localhost. Preview: null (ver abaixo).
 */
function trustedEndpoint(): string | null {
  if (process.env.VERCEL_ENV === "production" && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}/api/agent-events`;
  }
  if (!process.env.VERCEL) return `http://localhost:${process.env.PORT ?? 3000}/api/agent-events`;
  return null;
}

async function post(
  url: string | null,
  body: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const authorization = `Bearer ${process.env.AGENT_API_TOKEN}`;
  if (!url) {
    // Deploys de preview ficam atrás da proteção da Vercel: processa aqui mesmo, pelo mesmo handler.
    return handleAgentEvent(
      { authorization, contentType: "application/json", body },
      {
        token: process.env.AGENT_API_TOKEN,
        threshold: thresholdFromEnv(process.env.AGENT_AUTO_APPLY_THRESHOLD),
        withDb: withTransactionalDb,
      },
    );
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", authorization },
    body,
    cache: "no-store",
  });
  return {
    status: res.status,
    body: (await res.json().catch(() => ({ error: "resposta não JSON" }))) as Record<
      string,
      unknown
    >,
  };
}

async function send(events: unknown[]): Promise<SendResult[]> {
  const url = trustedEndpoint();
  const results: SendResult[] = [];
  // Em ordem: a conversa 1 cria o cliente antes do orçamento.
  for (const event of events) {
    const res = await post(url, JSON.stringify(event));
    const e = event as { event_id?: unknown; type?: unknown };
    results.push({
      eventId: String(e.event_id ?? "?"),
      type: String(e.type ?? "?"),
      httpStatus: res.status,
      body: res.body,
    });
  }
  revalidatePath("/hoje");
  revalidatePath("/revisao");
  revalidatePath("/clientes");
  return results;
}

export async function processPresetAction(presetId: string): Promise<SendResult[]> {
  await requireSession();
  return send(buildPresetEvents(presetId, todayInStore()));
}

export async function sendCustomJsonAction(
  json: string,
): Promise<{ results?: SendResult[]; error?: string }> {
  await requireSession();
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { error: "JSON inválido: confira vírgulas e aspas." };
  }
  const events = Array.isArray(parsed) ? parsed : [parsed];
  if (events.length > 20) return { error: "Envie no máximo 20 eventos por vez." };
  return { results: await send(events) };
}

export async function resetDemoAction(): Promise<{ ok: boolean; message: string }> {
  await requireSession();
  const summary = await withTransactionalDb((db) => resetDemoData(db));
  revalidatePath("/", "layout");
  return {
    ok: true,
    message: `Demonstração reiniciada para hoje: ${summary.customers} clientes, ${summary.manualTasks + summary.autoTasksCreated} próximas ações e ${summary.reviewItems} sugestões na fila.`,
  };
}
