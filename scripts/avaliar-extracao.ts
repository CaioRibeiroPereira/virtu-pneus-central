// Banco de testes da extração (D42/D52): roda conversas fictícias no Gemini e/ou no Ollama, com o
// MESMO pós-processamento, e compara com o gabarito. Dois conjuntos:
//  - simulador: as conversas do simulador (§12.3), usadas durante o desenvolvimento do prompt;
//  - validacao: scripts/avaliacao/conversas-validacao.json, escritas ANTES de ajustar o Ollama e
//    nunca usadas para escolher exemplos — é o teste de que a melhoria não "decorou a prova".
//
//   npx tsx --env-file=.env.local scripts/avaliar-extracao.ts [--provedor gemini|ollama|ambos]
//        [--modelos-ollama llama3.2:3b,qwen2.5:3b] [--modos direto,focado+dicas]
//        [--conjunto simulador|validacao|todos] [--rodadas 1] [--salvar [arquivo.md]]
import { readFileSync, writeFileSync } from "node:fs";
import { EXTRACTION_PROMPT_VERSION, postProcess } from "@/lib/agent/extraction";
import { scoreExtraction, type Score } from "@/lib/agent/evaluation";
import { FOCUSED_VERSION } from "@/lib/agent/focused";
import { thresholdFromEnv } from "@/lib/agent/handler";
import {
  callGeminiWithFallback,
  callOllama,
  geminiModelsFromEnv,
  type LlmCall,
  type LlmResult,
} from "@/lib/agent/llm";
import { MODES, runExtraction, type Mode } from "@/lib/agent/strategies";
import { todayInStore } from "@/lib/dates";
import { PRESETS, resolvePlaceholders } from "@/lib/simulator/presets";

const args = process.argv.slice(2);
const arg = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : fallback;
};
const list = (v: string) =>
  v
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
const provider = arg("provedor", "ambos");
const runs = Math.max(1, Number(arg("rodadas", "1")));
const ollamaModels = list(arg("modelos-ollama", process.env.OLLAMA_MODEL ?? "llama3.2:3b"));
const modes = list(arg("modos", "direto")) as Mode[];
for (const m of modes) if (!MODES.includes(m)) throw new Error(`modo inválido: ${m} (${MODES})`);
const setArg = arg("conjunto", "todos");
const outFile = args.includes("--salvar") ? arg("salvar", "docs/AVALIACAO_IA.md") : null;
const threshold = thresholdFromEnv(process.env.AGENT_AUTO_APPLY_THRESHOLD);

// ---------- conversas ----------
type ExpectedRaw = { type: string; confidence: number; data: Record<string, unknown> };
type Conv = {
  id: string;
  set: "simulador" | "validacao";
  phone: string;
  messages: { from: string; text: string }[];
  events: ExpectedRaw[];
};
const simulador: Conv[] = PRESETS.filter((p) => !p.replays) // o reenvio testa o endpoint, não a IA
  .map((p) => ({ ...p, set: "simulador" as const }));
const validacao: Conv[] = (
  JSON.parse(readFileSync("scripts/avaliacao/conversas-validacao.json", "utf8")) as Omit<
    Conv,
    "set"
  >[]
).map((c) => ({ ...c, set: "validacao" as const }));
const convs = [
  ...(setArg === "validacao" ? [] : simulador),
  ...(setArg === "simulador" ? [] : validacao),
];

// ---------- configurações (provedor × modelo × modo) ----------
type Config = { label: string; mode: Mode; call: (c: LlmCall) => Promise<LlmResult> };
const configs: Config[] = [];
for (const mode of modes) {
  if (provider === "gemini" || provider === "ambos") {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("Defina GEMINI_API_KEY no .env.local");
    const models = geminiModelsFromEnv();
    configs.push({
      label: `Gemini (${models[0]}) · ${mode}`,
      mode,
      call: (c) => callGeminiWithFallback(c, { apiKey, models }),
    });
  }
  if (provider === "ollama" || provider === "ambos") {
    const baseUrl = process.env.OLLAMA_URL ?? "http://localhost:11434";
    for (const model of ollamaModels) {
      configs.push({
        label: `Ollama (${model}) · ${mode}`,
        mode,
        // qwen3 "pensa" antes de responder por padrão; desligado para caber no tempo da CPU.
        call: (c) =>
          callOllama(c, { baseUrl, model, ...(model.startsWith("qwen3") ? { think: false } : {}) }),
      });
    }
  }
}

type Row = {
  config: string;
  set: Conv["set"];
  conv: string;
  model: string;
  ms: number;
  calls: number;
  score?: Score;
  maxPoints: number;
  expectedCount: number;
  rejectedIssues: string[];
  adjusted: number;
  error?: string;
};

const now = new Date();
const today = todayInStore(now);
const rows: Row[] = [];

for (const config of configs) {
  for (let run = 1; run <= runs; run++) {
    for (const conv of convs) {
      const expected = conv.events.map((e) => ({
        type: e.type,
        confidence: e.confidence,
        data: resolvePlaceholders(e.data, today, now) as Record<string, unknown>,
      }));
      const row: Row = {
        config: config.label,
        set: conv.set,
        conv: conv.id,
        model: "",
        ms: 0,
        calls: 0,
        maxPoints: scoreExtraction(expected, [], threshold).maxPoints,
        expectedCount: expected.length,
        rejectedIssues: [],
        adjusted: 0,
      };
      try {
        const r = await runExtraction(config.mode, config.call, { messages: conv.messages, today });
        Object.assign(row, { model: r.model, ms: r.ms, calls: r.calls });
        const out = postProcess(r.raw, conv.messages, {
          phone: conv.phone,
          conversationId: `aval-${conv.id}`,
          messageIds: conv.messages.map((_, i) => `aval-${conv.id}-${i + 1}`),
          occurredAt: now.toISOString(),
          model: r.model,
        });
        row.rejectedIssues = out.rejected.flatMap((x) => x.issues);
        row.adjusted = out.adjustments.length;
        if (out.error) row.error = out.error;
        row.score = scoreExtraction(expected, out.events, threshold);
      } catch (error) {
        row.error = error instanceof Error ? error.message.slice(0, 160) : String(error);
      }
      rows.push(row);
      const s = row.score;
      console.log(
        `${config.label} #${run} ${conv.id}: ${s ? `${s.points}/${s.maxPoints}` : "—"} ` +
          `${row.ms} ms (${row.calls} chamada(s))${row.error ? ` ERRO ${row.error}` : ""}` +
          (s?.missing.length ? ` faltou ${s.missing.join(",")}` : "") +
          (s?.extra.length ? ` extra ${s.extra.join(",")}` : ""),
      );
    }
  }
}

// ---------- resumo ----------
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
/** Entraria no cadastro sem o gestor ver: evento a mais aplicado ou rota “aplica” onde devia revisar. */
const unsafe = (score: Score) =>
  score.extraApplied.length +
  score.routes.filter((x) => x.got === "aplica" && x.expected === "revisão").length;

function summarize(mine: Row[]) {
  const ok = mine.filter((r) => r.score);
  const points = ok.reduce((s, r) => s + r.score!.points, 0);
  const max = mine.reduce((s, r) => s + r.maxPoints, 0);
  const times = ok.map((r) => r.ms).sort((a, b) => a - b);
  const fields = ok.flatMap((r) => r.score!.fields);
  const routes = ok.flatMap((r) => r.score!.routes);
  return {
    acerto: pct(points, max),
    indevidos: ok.reduce((s, r) => s + unsafe(r.score!), 0),
    tipos: `${routes.length}/${mine.reduce((s, r) => s + r.expectedCount, 0)}`,
    campos: `${fields.filter((f) => f.ok).length}/${fields.length}`,
    rotas: `${routes.filter((r) => r.ok).length}/${routes.length}`,
    extras: ok.reduce((s, r) => s + r.score!.extra.length, 0),
    rejeitados: mine.reduce((s, r) => s + r.rejectedIssues.length, 0),
    falhas: mine.filter((r) => r.error && !r.score).length,
    mediana: times.length ? `${(times[Math.floor(times.length / 2)] / 1000).toFixed(1)} s` : "—",
    pior: times.length ? `${(times[times.length - 1] / 1000).toFixed(1)} s` : "—",
  };
}

const sets = [...new Set(convs.map((c) => c.set))];
const summary = configs.flatMap((config) => [
  ...sets.map((set) => ({
    config: config.label,
    conjunto: set,
    ...summarize(rows.filter((r) => r.config === config.label && r.set === set)),
  })),
  ...(sets.length > 1
    ? [
        {
          config: config.label,
          conjunto: "total",
          ...summarize(rows.filter((r) => r.config === config.label)),
        },
      ]
    : []),
]);
console.table(summary);

if (outFile) {
  const lines = [
    "# Avaliação da extração por IA",
    "",
    `Gerado por \`scripts/avaliar-extracao.ts\` em ${today}. Prompt direto \`${EXTRACTION_PROMPT_VERSION}\`, ` +
      `extração focada \`${FOCUSED_VERSION}\`, limiar de aplicação automática ${threshold}, ` +
      `${runs} rodada(s) por conversa.`,
    "",
    "**Conjuntos:** *simulador* = as 5 conversas do simulador (o reenvio fica de fora: testa o " +
      "endpoint, não a IA), usadas durante o desenvolvimento do prompt; *validacao* = 8 conversas " +
      "escritas antes de ajustar o Ollama e nunca usadas para escolher exemplos " +
      "(`scripts/avaliacao/conversas-validacao.json`).",
    "",
    "**Modos:** *direto* = um pedido com os 8 tipos de evento; *focado* = classificação + um pedido " +
      "por tipo (D52); *+dicas* = placas, medidas, valores e horários achados por código entram no pedido.",
    "",
    "**Nota (por conversa):** 1 ponto por tipo de evento esperado que apareceu, 1 por campo-chave " +
      "certo (valor, placa, medida, data do agendamento, status…) e 1 se a rota (aplica sozinho × " +
      "revisão) bate com o gabarito. **Indevidos** = eventos que entrariam no cadastro sem o gestor " +
      "ver (evento a mais com confiança alta, ou rota “aplica” onde o gabarito pede revisão) — o erro " +
      "que custa caro. Eventos a mais não tiram ponto, mas aparecem em “extras”.",
    "",
    "## Resumo",
    "",
    "| Configuração | Conjunto | Acerto | Indevidos | Tipos | Campos-chave | Rotas | Extras | Rejeitados | Falhas | Mediana | Pior |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|",
    ...summary.map(
      (s) =>
        `| ${s.config} | ${s.conjunto} | ${s.acerto} | ${s.indevidos} | ${s.tipos} | ${s.campos} | ${s.rotas} | ${s.extras} | ${s.rejeitados} | ${s.falhas} | ${s.mediana} | ${s.pior} |`,
    ),
    "",
    "## Por conversa",
    "",
    "| Configuração | Conversa | Nota | Tempo | Observações |",
    "|---|---|---|---|---|",
    ...rows.map((r) => {
      const s = r.score;
      const notes = [
        r.error && `erro: ${r.error.replace(/\|/g, "/")}`,
        s?.missing.length && `faltou ${s.missing.join(", ")}`,
        s?.extra.length && `extra ${s.extra.join(", ")}`,
        s?.extraApplied.length && `entraria sem revisão: ${s.extraApplied.join(", ")}`,
        ...(s?.fields.filter((f) => !f.ok) ?? []).map(
          (f) =>
            `${f.field}: esperado ${JSON.stringify(f.expected)}, veio ${JSON.stringify(f.got)}`,
        ),
        ...(s?.routes.filter((x) => !x.ok) ?? []).map(
          (x) => `${x.type} iria para “${x.got}” (esperado “${x.expected}”)`,
        ),
        r.rejectedIssues.length && `rejeitado: ${r.rejectedIssues.join("; ").replace(/\|/g, "/")}`,
        r.adjusted && `${r.adjusted} ajuste(s) do pós-processamento`,
        r.model && !r.config.includes(r.model) && `respondeu o modelo reserva ${r.model}`,
      ].filter(Boolean);
      return `| ${r.config} | ${r.conv} | ${s ? `${s.points}/${s.maxPoints}` : "—"} | ${(r.ms / 1000).toFixed(1)} s | ${notes.join("; ") || "ok"} |`;
    }),
    "",
  ];
  writeFileSync(outFile, lines.join("\n"));
  console.log(`Relatório salvo em ${outFile}`);
}
