// Camada HTTP do POST /api/agent-events (§8.3 passos 1–2 e §8.4), sem depender do Next:
// recebe os dados da requisição e devolve status + corpo. Assim os testes chamam esta função
// direto, com um banco PGlite, e a rota do Next só faz a ligação.
import type { Db } from "@/db";
import { bearerMatches } from "@/lib/auth/token";
import { processAgentEvent } from "./process";
import { agentEventSchema, MAX_BODY_BYTES } from "./schema";

export type AgentRequest = {
  authorization: string | null;
  contentType: string | null;
  body: string;
};

export type AgentHandlerDeps = {
  token: string | undefined;
  threshold: number;
  /** Abre um banco com transação para processar o evento. */
  withDb: <T>(fn: (db: Db) => Promise<T>) => Promise<T>;
};

export type AgentResponse = { status: number; body: Record<string, unknown> };

export async function handleAgentEvent(
  req: AgentRequest,
  deps: AgentHandlerDeps,
): Promise<AgentResponse> {
  // 1. Autenticação (comparação em tempo constante).
  if (!bearerMatches(req.authorization, deps.token)) {
    return { status: 401, body: { error: "unauthorized" } };
  }
  if (!req.contentType?.toLowerCase().includes("application/json")) {
    return { status: 415, body: { error: "unsupported_media_type", expected: "application/json" } };
  }
  if (new TextEncoder().encode(req.body).length > MAX_BODY_BYTES) {
    return { status: 413, body: { error: "payload_too_large", max_bytes: MAX_BODY_BYTES } };
  }

  // 2. Validação do contrato.
  let json: unknown;
  try {
    json = JSON.parse(req.body);
  } catch {
    return {
      status: 422,
      body: { error: "invalid_payload", issues: [{ path: "", message: "JSON inválido" }] },
    };
  }
  const parsed = agentEventSchema.safeParse(json);
  if (!parsed.success) {
    return {
      status: 422,
      body: {
        error: "invalid_payload",
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
    };
  }

  // 3–6. Processamento.
  try {
    const outcome = await deps.withDb((db) =>
      processAgentEvent(db, parsed.data, { threshold: deps.threshold }),
    );
    switch (outcome.status) {
      case "applied":
        return {
          status: 201,
          body: {
            status: "applied",
            event_id: outcome.eventId,
            customer_id: outcome.customerId,
            applied: outcome.applied,
          },
        };
      case "queued_for_review":
        return {
          status: 202,
          body: {
            status: "queued_for_review",
            event_id: outcome.eventId,
            review_id: outcome.reviewId,
            reason: outcome.reason,
          },
        };
      case "duplicate":
        return { status: 200, body: { status: "duplicate", event_id: outcome.eventId } };
    }
  } catch (error) {
    // Log sem payload nem dados pessoais (§11): só o identificador do evento e o tipo do erro.
    console.error("agent-event falhou", {
      event_id: parsed.data.event_id,
      error: error instanceof Error ? error.message : "desconhecido",
    });
    return { status: 500, body: { error: "internal_error", event_id: parsed.data.event_id } };
  }
}

/** Lê o limiar de confiança do ambiente, limitado a [0, 1] (padrão 0,85). */
export function thresholdFromEnv(value: string | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : 0.85;
}
