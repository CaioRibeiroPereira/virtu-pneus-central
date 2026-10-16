// Gera os workflows do n8n (infra/n8n/workflows/) a partir do código do repositório (D42/D46).
// Na extração, os nós de código rodam o MESMO buildPrompt e o núcleo do pós-processamento de
// lib/agent/, empacotados com esbuild — o prompt e as checagens não são copiados à mão.
//
//   npx tsx scripts/gerar-workflow-n8n.ts
//
// O JSON gerado não contém segredos: a chave do Gemini e o token do endpoint ficam em credenciais
// do próprio n8n (Header Auth), escolhidas depois de importar o workflow.
import { buildSync } from "esbuild";
import { writeFileSync } from "node:fs";
import { EXTRACTION_PROMPT_VERSION, extractionJsonSchema } from "@/lib/agent/extraction";

// Empacota uma função do repositório e a pendura em `Extracao` por atribuição simples. (O formato
// com globalName do esbuild expõe as funções por getters — Object.defineProperty —, que o sandbox
// do task runner do n8n não preserva: "Extracao.buildPrompt is not a function".)
const pack = (name: string, from: string) =>
  "const Extracao = {};\n" +
  buildSync({
    stdin: {
      contents: `import { ${name} } from "${from}";\nExtracao.${name} = ${name};`,
      resolveDir: process.cwd(),
      loader: "ts",
    },
    bundle: true,
    format: "iife",
    platform: "neutral",
    target: "es2022",
    // Sem renomear variáveis: o código continua legível dentro do nó do n8n.
    minifyWhitespace: true,
    minifySyntax: true,
    tsconfig: "tsconfig.json",
    write: false,
  }).outputFiles[0].text;

// O prompt não usa zod (leve); o formato pedido à IA é fixo e vai pronto, como JSON.
const promptBundle = pack("buildPrompt", "./lib/agent/prompt");
const schemaJson = JSON.stringify(extractionJsonSchema());
// Pós-processamento sem zod (D50): o sandbox do n8n desativa Object.defineProperty, de que o zod
// depende. A validação completa do contrato acontece no endpoint, evento a evento.
const postBundle = pack("postProcessLite", "./lib/agent/refine");

const banner = (what: string) =>
  `// ${what}\n// GERADO por scripts/gerar-workflow-n8n.ts a partir de lib/agent/ (prompt.ts, refine.ts) ` +
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
const geminiFallbackModel = env("VITO_GEMINI_FALLBACK_MODEL", "gemini-3.5-flash-lite");
const ollamaModel = env("VITO_OLLAMA_MODEL", "llama3.2:3b");

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
    geminiFallbackUrl: "https://generativelanguage.googleapis.com/v1beta/models/" + geminiFallbackModel + ":generateContent",
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
const out = Extracao.postProcessLite(text, c.messages, {
  phone: c.phone,
  conversationId: c.conversationId,
  messageIds: c.messageIds,
  occurredAt: c.occurredAt,
  model: response.modelVersion || response.model || request.model, // quem respondeu de fato (pode ser o reserva)
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

// Referência às credenciais (só id e nome; o VALOR fica no n8n). Quem criar credenciais com outros
// ids escolhe nos nós depois de importar.
const CREDENTIALS = {
  gemini: { id: "vitoGeminiKey001", name: "Gemini (x-goog-api-key)" },
  agent: { id: "vitoAgentToken01", name: "Sistema Virtù (Bearer)" },
  telegram: { id: "vitoTelegramBot01", name: "Telegram (bot do resumo)" },
};

const workflow = {
  id: "vitoExtracao0001",
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
      credentials: { httpHeaderAuth: CREDENTIALS.gemini },
      retryOnFail: true, // 429/503 são comuns no plano gratuito
      maxTries: 2,
      waitBetweenTries: 3000,
      // Esgotadas as tentativas, a saída de erro leva ao modelo reserva (D43).
      onError: "continueErrorOutput",
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
      id: "a1f0c7e2-0008-4c1a-9b10-000000000008",
      name: "Gemini (modelo reserva)",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [960, 240],
      credentials: { httpHeaderAuth: CREDENTIALS.gemini },
      retryOnFail: true,
      maxTries: 3,
      waitBetweenTries: 4000,
      parameters: {
        method: "POST",
        // O item que chega é o erro do nó anterior: o pedido vem do nó que o montou.
        url: "={{ $('Montar pedido à IA').first().json.geminiFallbackUrl }}",
        ...headerAuth,
        sendBody: true,
        specifyBody: "json",
        jsonBody: "={{ JSON.stringify($('Montar pedido à IA').first().json.geminiBody) }}",
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
      credentials: { httpHeaderAuth: CREDENTIALS.agent },
      retryOnFail: true,
      maxTries: 3,
      waitBetweenTries: 2000,
      // Um evento recusado (422) não impede o envio dos outros; a resposta fica na execução.
      onError: "continueRegularOutput",
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
    Gemini: {
      main: [
        [{ node: "Pós-processar", type: "main", index: 0 }],
        [{ node: "Gemini (modelo reserva)", type: "main", index: 0 }],
      ],
    },
    "Gemini (modelo reserva)": { main: [[{ node: "Pós-processar", type: "main", index: 0 }]] },
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

// ---------- resumo diário (§12.2, extra T2) ----------
// 7h45 → GET /api/agenda/hoje → Telegram. A mensagem vem pronta do sistema (lib/rules/digest.ts).
const digestWorkflow = {
  id: "vitoResumoDiario01",
  name: "Vito — resumo diário no Telegram",
  nodes: [
    {
      id: "b2e1d3f4-0001-4c1a-9b10-000000000001",
      name: "Todo dia às 7h45",
      type: "n8n-nodes-base.scheduleTrigger",
      typeVersion: 1.2,
      position: [0, 0],
      parameters: { rule: { interval: [{ field: "cronExpression", expression: "45 7 * * *" }] } },
    },
    {
      id: "b2e1d3f4-0002-4c1a-9b10-000000000002",
      name: "Painel de hoje",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [240, 0],
      credentials: { httpHeaderAuth: CREDENTIALS.agent },
      retryOnFail: true, // o banco gratuito pode estar "acordando" às 7h45
      maxTries: 3,
      waitBetweenTries: 5000,
      parameters: {
        method: "GET",
        url: "={{ ($env.VITO_APP_URL || 'http://host.docker.internal:3000') + '/api/agenda/hoje' }}",
        ...headerAuth,
        options: { timeout: 60000 },
      },
    },
    {
      id: "b2e1d3f4-0003-4c1a-9b10-000000000003",
      name: "Enviar no Telegram",
      type: "n8n-nodes-base.telegram",
      typeVersion: 1.2,
      position: [480, 0],
      credentials: { telegramApi: CREDENTIALS.telegram },
      retryOnFail: true,
      maxTries: 3,
      waitBetweenTries: 5000,
      parameters: {
        resource: "message",
        operation: "sendMessage",
        chatId: "={{ $env.VITO_TELEGRAM_CHAT_ID }}",
        text: "={{ $json.mensagem }}",
        additionalFields: { appendAttribution: false },
      },
    },
  ],
  connections: {
    "Todo dia às 7h45": { main: [[{ node: "Painel de hoje", type: "main", index: 0 }]] },
    "Painel de hoje": { main: [[{ node: "Enviar no Telegram", type: "main", index: 0 }]] },
  },
  settings: { executionOrder: "v1", timezone: "America/Sao_Paulo" },
  pinData: {},
};

writeFileSync(
  "infra/n8n/workflows/vito-resumo-diario.json",
  JSON.stringify(digestWorkflow, null, 2) + "\n",
);
console.log("infra/n8n/workflows/vito-resumo-diario.json gerado");

// ---------- conversas do Telegram → extração (D57) ----------
// A cada minuto: conversas do Telegram prontas (paradas há 2 min, com telefone) → o MESMO webhook
// de extração do WhatsApp → confirma no sistema. Nada de extração duplicada aqui.
const appUrl = "($env.VITO_APP_URL || 'http://host.docker.internal:3000')";
const telegramWorkflow = {
  id: "vitoTelegramExtracao1",
  name: "Vito — conversas do Telegram para a extração",
  nodes: [
    {
      id: "c3f2e4a5-0001-4c1a-9b10-000000000001",
      name: "A cada minuto",
      type: "n8n-nodes-base.scheduleTrigger",
      typeVersion: 1.2,
      position: [0, 0],
      parameters: { rule: { interval: [{ field: "minutes", minutesInterval: 1 }] } },
    },
    {
      id: "c3f2e4a5-0002-4c1a-9b10-000000000002",
      name: "Conversas prontas",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [240, 0],
      credentials: { httpHeaderAuth: CREDENTIALS.agent },
      parameters: {
        method: "GET",
        url: `={{ ${appUrl} + '/api/telegram/conversas' }}`,
        ...headerAuth,
        options: { timeout: 60000 },
      },
    },
    {
      id: "c3f2e4a5-0003-4c1a-9b10-000000000003",
      name: "Uma conversa por item",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [480, 0],
      parameters: {
        jsCode: "return ($input.first().json.conversas || []).map((c) => ({ json: c }));",
      },
    },
    {
      id: "c3f2e4a5-0004-4c1a-9b10-000000000004",
      name: "Enviar à extração",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [720, 0],
      parameters: {
        method: "POST",
        // O workflow de extração, nesta mesma instância do n8n.
        url: "http://localhost:5678/webhook/vito-conversa",
        sendBody: true,
        specifyBody: "json",
        jsonBody:
          "={{ JSON.stringify({ phone: $json.phone, conversation_id: $json.conversation_id, message_ids: $json.message_ids, messages: $json.messages }) }}",
        options: { timeout: 30000 },
      },
    },
    {
      id: "c3f2e4a5-0005-4c1a-9b10-000000000005",
      name: "Marcar como extraída",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [960, 0],
      credentials: { httpHeaderAuth: CREDENTIALS.agent },
      parameters: {
        method: "POST",
        url: `={{ ${appUrl} + '/api/telegram/conversas/' + $('Uma conversa por item').item.json.chat_id + '/extraida' }}`,
        ...headerAuth,
        sendBody: true,
        specifyBody: "json",
        jsonBody: "={{ JSON.stringify({ ate: $('Uma conversa por item').item.json.ate }) }}",
        options: { timeout: 30000 },
      },
    },
  ],
  connections: {
    "A cada minuto": { main: [[{ node: "Conversas prontas", type: "main", index: 0 }]] },
    "Conversas prontas": { main: [[{ node: "Uma conversa por item", type: "main", index: 0 }]] },
    "Uma conversa por item": { main: [[{ node: "Enviar à extração", type: "main", index: 0 }]] },
    "Enviar à extração": { main: [[{ node: "Marcar como extraída", type: "main", index: 0 }]] },
  },
  settings: { executionOrder: "v1", timezone: "America/Sao_Paulo" },
  pinData: {},
};

writeFileSync(
  "infra/n8n/workflows/vito-telegram-extracao.json",
  JSON.stringify(telegramWorkflow, null, 2) + "\n",
);
console.log("infra/n8n/workflows/vito-telegram-extracao.json gerado");
