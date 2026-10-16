// Liga o bot da oficina ao sistema (D57): registra o webhook com o segredo e a descrição que o
// cliente vê antes de começar (transparência: é um assistente automático).
//
//   npx tsx --env-file=.env.local scripts/telegram-webhook.ts [https://virtu-pneus-central.vercel.app]
const token = process.env.TELEGRAM_CLIENTE_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
if (!token || !secret)
  throw new Error("Defina TELEGRAM_CLIENTE_BOT_TOKEN e TELEGRAM_WEBHOOK_SECRET");
const base = process.argv[2] ?? "https://virtu-pneus-central.vercel.app";

async function call(method: string, body: object) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { ok: boolean; description?: string; result?: unknown };
  if (!json.ok) throw new Error(`${method}: ${json.description}`);
  return json.result;
}

await call("setWebhook", {
  url: `${base}/api/telegram/webhook`,
  secret_token: secret,
  allowed_updates: ["message"],
});
await call("setMyDescription", {
  description:
    "Assistente automático da Virtù Pneus. Respondo horário, endereço e o seu agendamento; o resto o dono da oficina responde pessoalmente. As mensagens ficam registradas para o atendimento.",
});
await call("setMyShortDescription", {
  short_description: "Assistente automático da Virtù Pneus (demonstração).",
});
const info = (await call("getWebhookInfo", {})) as {
  url: string;
  pending_update_count: number;
  last_error_message?: string;
};
console.log(
  "webhook:",
  info.url,
  "| pendentes:",
  info.pending_update_count,
  info.last_error_message ? `| último erro: ${info.last_error_message}` : "",
);

export {}; // módulo (permite await no topo)
