// Chamadas aos dois provedores de IA (D42), com o MESMO prompt e o MESMO JSON Schema.
// Usado pelo banco de testes (scripts/avaliar-extracao.ts); o workflow do n8n faz as mesmas
// chamadas HTTP (infra/n8n). Nada aqui roda no navegador.

export type Provider = "gemini" | "ollama";

export type LlmCall = {
  system: string;
  user: string;
  schema: Record<string, unknown>;
};

export type LlmResult = { text: string; ms: number; model: string; provider: Provider };

/** 429 (limite) e 5xx (instável) costumam ser passageiros no plano gratuito: tenta de novo. */
const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Erro passageiro: HTTP 429/5xx ou falha de rede/tempo esgotado (sem status HTTP). */
function isTransient(error: unknown): boolean {
  const status = (error as { status?: number }).status;
  return status ? RETRYABLE.has(status) : true;
}

export async function callGemini(
  call: LlmCall,
  opts: { apiKey: string; model: string; timeoutMs?: number; attempts?: number },
): Promise<LlmResult & { attempts: number }> {
  const attempts = opts.attempts ?? 4;
  for (let attempt = 1; ; attempt++) {
    try {
      return { ...(await callGeminiOnce(call, opts)), attempts: attempt };
    } catch (error) {
      if (attempt >= attempts || !isTransient(error)) throw error;
      await sleep(2000 * 2 ** (attempt - 1)); // 2 s, 4 s, 8 s
    }
  }
}

/**
 * Tenta o modelo principal e, se ele seguir indisponível (429/5xx) depois das novas tentativas,
 * os modelos reserva em ordem. O plano gratuito oscila bastante em horário de pico.
 */
export async function callGeminiWithFallback(
  call: LlmCall,
  opts: { apiKey: string; models: string[]; attemptsPerModel?: number },
): Promise<LlmResult & { attempts: number; tried: string[] }> {
  const tried: string[] = [];
  let lastError: unknown;
  for (const model of opts.models) {
    tried.push(model);
    try {
      const result = await callGemini(call, {
        apiKey: opts.apiKey,
        model,
        attempts: opts.attemptsPerModel ?? 2,
      });
      return { ...result, tried };
    } catch (error) {
      lastError = error;
      if (!isTransient(error)) throw error; // erro de chave/formato: não adianta trocar de modelo
    }
  }
  throw lastError;
}

/** Modelos do Gemini a usar, em ordem: GEMINI_MODEL e depois GEMINI_FALLBACK_MODELS. */
export function geminiModelsFromEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  const list = [env.GEMINI_MODEL, ...(env.GEMINI_FALLBACK_MODELS ?? "").split(",")]
    .map((m) => m?.trim())
    .filter((m): m is string => !!m);
  return [...new Set(list)];
}

async function callGeminiOnce(
  call: LlmCall,
  opts: { apiKey: string; model: string; timeoutMs?: number },
): Promise<LlmResult> {
  const started = Date.now();
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(opts.model)}:generateContent`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": opts.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: call.system }] },
        contents: [{ role: "user", parts: [{ text: call.user }] }],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
          responseJsonSchema: call.schema,
        },
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000),
    },
  );
  const body = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    error?: { message?: string; status?: string };
  };
  if (!res.ok) {
    throw Object.assign(
      new Error(
        `Gemini ${res.status}: ${body.error?.status ?? ""} ${body.error?.message ?? ""}`.trim(),
      ),
      { status: res.status },
    );
  }
  const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  return { text, ms: Date.now() - started, model: opts.model, provider: "gemini" };
}

export async function callOllama(
  call: LlmCall,
  opts: { baseUrl: string; model: string; timeoutMs?: number },
): Promise<LlmResult> {
  const started = Date.now();
  const res = await fetch(`${opts.baseUrl.replace(/\/$/, "")}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: opts.model,
      messages: [
        { role: "system", content: call.system },
        { role: "user", content: call.user },
      ],
      format: call.schema, // saída restrita ao JSON Schema (structured outputs)
      stream: false,
      keep_alive: "15m", // mantém o modelo carregado entre conversas
      options: { temperature: 0, num_ctx: 4096 },
    }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 300_000),
  });
  const body = (await res.json()) as { message?: { content?: string }; error?: string };
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${body.error ?? ""}`.trim());
  return {
    text: body.message?.content ?? "",
    ms: Date.now() - started,
    model: opts.model,
    provider: "ollama",
  };
}
