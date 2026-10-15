// Gera infra/n8n/workflows/vito-extracao.json a partir do código do repositório (D42).
// O nó de código do n8n roda o MESMO buildPrompt / extractionJsonSchema / postProcess de
// lib/agent/extraction.ts, empacotados com esbuild — o prompt e as checagens não são copiados à mão.
//
//   npx tsx scripts/gerar-workflow-n8n.ts
//
// O JSON gerado não contém segredos: a chave do Gemini e o token do endpoint ficam em credenciais
// do próprio n8n (Header Auth), escolhidas depois de importar o workflow.
import { buildSync } from "esbuild";
import { writeFileSync } from "node:fs";
import { EXTRACTION_PROMPT_VERSION, extractionJsonSchema } from "@/lib/agent/extraction";

const pack = (contents: string) =>
  buildSync({
    stdin: { contents, resolveDir: process.cwd(), loader: "ts" },
    bundle: true,
    format: "iife",
    globalName: "Extracao",
    platform: "neutral",
    target: "es2022",
    minify: true,
    tsconfig: "tsconfig.json",
    write: false,
  }).outputFiles[0].text;

// O prompt não usa zod (leve); o formato pedido à IA é fixo e vai pronto, como JSON.
const promptBundle = pack(`export { buildPrompt } from "./lib/agent/prompt";`);
const schemaJson = JSON.stringify(extractionJsonSchema());
// Só o pós-processamento precisa do zod (validação completa do contrato).
const postBundle = pack(`export { postProcess } from "./lib/agent/extraction";`);

const banner = (what: string) =>
  `// ${what}\n// GERADO por scripts/gerar-workflow-n8n.ts a partir de lib/agent/extraction.ts ` +
  `(${EXTRACTION_PROMPT_VERSION}). Não edite aqui: edite o repositório e gere de novo.\n`;

// Configuração lida das variáveis de ambiente do n8n (docker-compose / .env), com padrões locais.
const config = `
function env(name, fallback) {
  try { return $env[name] || fallback; } catch { return fallback; }
}
`;

const buildRequest = `${banner("Monta o pedido à IA: mesmo prompt e mesmo formato para Gemini e Ollama.")}
${promptBundle}
const SCHEMA = ${schemaJson};
${config}
const body = $input.first().json.body ?? {};
if (!Array.isArray(body.messages) || !body.messages.length || !body.phone) {
  throw new Error('Envie { "phone": "...", "messages": [{ "from": "cliente", "text": "..." }] }');
}
const provider = body.provider || env("VITO_PROVIDER", "gemini");
if (provider !== "gemini" && provider !== "ollama") throw new Error("provider: gemini ou ollama");
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const prompt = Extracao.buildPrompt({ messages: body.messages, today });
const schema = SCHEMA;
const geminiModel = env("VITO_GEMINI_MODEL", "gemini-3.5-flash");
const ollamaModel = env("VITO_OLLAMA_MODEL", "qwen2.5:3b");

return [{
  json: {
    provider,
    model: provider === "gemini" ? geminiModel : ollamaModel,
    conversation: {
      phone: body.phone,
      conversationId: body.conversation_id || "n8n-" + $execution.id,
      messageIds: body.message_ids || body.messages.map((_, i) => "n8n-" + $execution.id + "-" + (i + 1)),
      messages: body.messages,
      occurredAt: body.occurred_at || new Date().toISOString(),
    },
    geminiUrl: "https://generativelanguage.googleapis.com/v1beta/models/" + geminiModel + ":generateContent",
    geminiBody: {
      systemInstruction: { parts: [{ text: prompt.system }] },
      contents: [{ role: "user", parts: [{ text: prompt.user }] }],
      generationConfig: { temperature: 0, responseMimeType: "application/json", responseJsonSchema: schema },
    },
    ollamaUrl: env("VITO_OLLAMA_URL", "http://host.docker.internal:11434") + "/api/chat",
    ollamaBody: {
      model: ollamaModel,
      messages: [{ role: "system", content: prompt.system }, { role: "user", content: prompt.user }],
      format: schema,
      stream: false,
      keep_alive: "15m",
      options: { temperature: 0, num_ctx: 4096 },
    },
  },
}];
`;

const postProcess = `${banner("Valida a saída da IA, recalcula a confiança e monta os eventos do contrato §8.1.")}
${postBundle}
${config}
const request = $("Montar pedido à IA").first().json;
const response = $input.first().json;
const text = response.candidates
  ? (response.candidates[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("")
  : response.message?.content ?? "";
const c = request.conversation;
const out = Extracao.postProcess(text, c.messages, {
  phone: c.phone,
  conversationId: c.conversationId,
  messageIds: c.messageIds,
  occurredAt: c.occurredAt,
  model: request.model,
});
if (out.error) throw new Error("Extração inválida: " + out.error);
const appUrl = env("VITO_APP_URL", "http://host.docker.internal:3000").replace(/\\/$/, "");
// Um item por evento: o próximo nó envia cada um ao endpoint (que é idempotente por event_id).
return out.events.map((event) => ({
  json: { url: appUrl + "/api/agent-events", event, rejected: out.rejected, adjustments: out.adjustments },
}));
`;

const headerAuth = {
  authentication: "genericCredentialType",
  genericAuthType: "httpHeaderAuth",
};

const workflow = {
  name: "Vito — extração de conversas (Gemini ou Ollama)",
  nodes: [
    {
      id: "a1f0c7e2-0001-4c1a-9b10-000000000001",
      name: "Conversa do WhatsApp",
      type: "n8n-nodes-base.webhook",
      typeVersion: 2,
      position: [0, 0],
      webhookId: "6f6b1d2e-5a51-4a8b-8d3e-7a0e9b1c0001",
      parameters: {
        httpMethod: "POST",
        path: "vito-conversa",
        responseMode: "onReceived", // o WhatsApp precisa de resposta rápida; o resto roda depois
        options: {},
      },
    },
    {
      id: "a1f0c7e2-0002-4c1a-9b10-000000000002",
      name: "Montar pedido à IA",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [240, 0],
      parameters: { jsCode: buildRequest },
    },
    {
      id: "a1f0c7e2-0003-4c1a-9b10-000000000003",
      name: "Qual provedor?",
      type: "n8n-nodes-base.if",
      typeVersion: 2,
      position: [480, 0],
      parameters: {
        conditions: {
          options: { caseSensitive: true, leftValue: "", typeValidation: "strict" },
          conditions: [
            {
              id: "c0ffee00-0000-4000-8000-000000000001",
              leftValue: "={{ $json.provider }}",
              rightValue: "ollama",
              operator: { type: "string", operation: "equals" },
            },
          ],
          combinator: "and",
        },
        options: {},
      },
    },
    {
      id: "a1f0c7e2-0004-4c1a-9b10-000000000004",
      name: "Ollama (local)",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [720, -120],
      retryOnFail: true,
      maxTries: 2,
      waitBetweenTries: 3000,
      parameters: {
        method: "POST",
        url: "={{ $json.ollamaUrl }}",
        sendBody: true,
        specifyBody: "json",
        jsonBody: "={{ JSON.stringify($json.ollamaBody) }}",
        options: { timeout: 300000 },
      },
    },
    {
      id: "a1f0c7e2-0005-4c1a-9b10-000000000005",
      name: "Gemini",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [720, 120],
      retryOnFail: true, // 429/503 são comuns no plano gratuito
      maxTries: 4,
      waitBetweenTries: 4000,
      parameters: {
        method: "POST",
        url: "={{ $json.geminiUrl }}",
        ...headerAuth, // credencial "Header Auth": nome x-goog-api-key, valor = chave do Gemini
        sendBody: true,
        specifyBody: "json",
        jsonBody: "={{ JSON.stringify($json.geminiBody) }}",
        options: { timeout: 60000 },
      },
    },
    {
      id: "a1f0c7e2-0006-4c1a-9b10-000000000006",
      name: "Pós-processar",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [960, 0],
      parameters: { jsCode: postProcess },
    },
    {
      id: "a1f0c7e2-0007-4c1a-9b10-000000000007",
      name: "Enviar ao sistema",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [1200, 0],
      retryOnFail: true,
      maxTries: 3,
      waitBetweenTries: 2000,
      parameters: {
        method: "POST",
        url: "={{ $json.url }}",
        ...headerAuth, // credencial "Header Auth": nome Authorization, valor = Bearer <AGENT_API_TOKEN>
        sendBody: true,
        specifyBody: "json",
        jsonBody: "={{ JSON.stringify($json.event) }}",
        options: { timeout: 30000 },
      },
    },
  ],
  connections: {
    "Conversa do WhatsApp": { main: [[{ node: "Montar pedido à IA", type: "main", index: 0 }]] },
    "Montar pedido à IA": { main: [[{ node: "Qual provedor?", type: "main", index: 0 }]] },
    "Qual provedor?": {
      main: [
        [{ node: "Ollama (local)", type: "main", index: 0 }],
        [{ node: "Gemini", type: "main", index: 0 }],
      ],
    },
    "Ollama (local)": { main: [[{ node: "Pós-processar", type: "main", index: 0 }]] },
    Gemini: { main: [[{ node: "Pós-processar", type: "main", index: 0 }]] },
    "Pós-processar": { main: [[{ node: "Enviar ao sistema", type: "main", index: 0 }]] },
  },
  settings: { executionOrder: "v1" },
  pinData: {},
};

writeFileSync("infra/n8n/workflows/vito-extracao.json", JSON.stringify(workflow, null, 2) + "\n");
console.log(
  `infra/n8n/workflows/vito-extracao.json gerado (pedido: ${Math.round((promptBundle.length + schemaJson.length) / 1024)} KB, ` +
    `pós-processamento: ${Math.round(postBundle.length / 1024)} KB)`,
);
