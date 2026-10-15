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

export async function callGemini(
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
    throw new Error(
      `Gemini ${res.status}: ${body.error?.status ?? ""} ${body.error?.message ?? ""}`.trim(),
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
