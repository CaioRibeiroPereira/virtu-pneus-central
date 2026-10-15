// Banco de testes da extração (D42): roda as conversas do simulador no Gemini e/ou no Ollama, com
// o MESMO prompt, o MESMO formato e o MESMO pós-processamento, e compara com o gabarito.
//
//   npx tsx --env-file=.env.local scripts/avaliar-extracao.ts [--provedor gemini|ollama|ambos]
//        [--rodadas 1] [--modelos-ollama qwen2.5:3b,llama3.2:3b] [--salvar]
//
// --salvar grava o resultado em docs/AVALIACAO_IA.md. Só usa conversas fictícias (§12.3).
import { writeFileSync } from "node:fs";
import {
  buildPrompt,
  EXTRACTION_PROMPT_VERSION,
  extractionJsonSchema,
  postProcess,
} from "@/lib/agent/extraction";
import { scoreExtraction, type Score } from "@/lib/agent/evaluation";
import { thresholdFromEnv } from "@/lib/agent/handler";
import {
  callGeminiWithFallback,
  callOllama,
  geminiModelsFromEnv,
  type LlmResult,
} from "@/lib/agent/llm";
import { todayInStore } from "@/lib/dates";
import { PRESETS, resolvePlaceholders } from "@/lib/simulator/presets";

const args = process.argv.slice(2);
const arg = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const provider = arg("provedor", "ambos");
const runs = Math.max(1, Number(arg("rodadas", "1")));
const ollamaModels = arg("modelos-ollama", process.env.OLLAMA_MODEL ?? "llama3.2:3b")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);
const threshold = thresholdFromEnv(process.env.AGENT_AUTO_APPLY_THRESHOLD);

type Config = { label: string; call: (c: Parameters<typeof callOllama>[0]) => Promise<LlmResult> };
const configs: Config[] = [];
if (provider === "gemini" || provider === "ambos") {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Defina GEMINI_API_KEY no .env.local");
  const models = geminiModelsFromEnv();
  configs.push({
    label: `Gemini (${models[0]})`,
    call: (c) => callGeminiWithFallback(c, { apiKey, models }),
  });
}
if (provider === "ollama" || provider === "ambos") {
  const baseUrl = process.env.OLLAMA_URL ?? "http://localhost:11434";
  for (const model of ollamaModels) {
    configs.push({ label: `Ollama (${model})`, call: (c) => callOllama(c, { baseUrl, model }) });
  }
}

type Row = {
  config: string;
  model: string;
  preset: string;
  ms: number;
  score?: Score;
  rejected: number;
  rejectedIssues: string[];
  adjusted: number;
  error?: string;
};

const now = new Date();
const today = todayInStore(now);
const schema = extractionJsonSchema();
const presets = PRESETS.filter((p) => !p.replays); // o reenvio testa o endpoint, não a IA
const rows: Row[] = [];

for (const config of configs) {
  for (let run = 1; run <= runs; run++) {
    for (const preset of presets) {
      const prompt = buildPrompt({ messages: preset.messages, today });
      const expected = preset.events.map((e) => ({
        type: e.type,
        confidence: e.confidence,
        data: resolvePlaceholders(e.data, today, now) as Record<string, unknown>,
      }));
      const row: Row = {
        config: config.label,
        model: "",
        preset: preset.id,
        ms: 0,
        rejected: 0,
        rejectedIssues: [],
        adjusted: 0,
      };
      try {
        const result = await config.call({ ...prompt, schema });
        row.model = result.model;
        row.ms = result.ms;
        const out = postProcess(result.text, preset.messages, {
          phone: preset.phone,
          conversationId: `aval-${preset.id}`,
          messageIds: preset.messages.map((_, i) => `aval-${preset.id}-${i + 1}`),
          occurredAt: now.toISOString(),
          model: result.model,
        });
        row.rejected = out.rejected.length;
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
        `${config.label} #${run} ${preset.id}: ${s ? `${s.points}/${s.maxPoints}` : "—"} ` +
          `${row.ms} ms${row.error ? ` ERRO ${row.error}` : ""}` +
          (s?.missing.length ? ` faltou ${s.missing.join(",")}` : "") +
          (s?.extra.length ? ` extra ${s.extra.join(",")}` : "") +
          (row.rejectedIssues.length ? ` rejeitado: ${row.rejectedIssues.join("; ")}` : ""),
      );
    }
  }
}

// ---------- relatório ----------
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
const summary = configs.map((config) => {
  const mine = rows.filter((r) => r.config === config.label);
  const ok = mine.filter((r) => r.score);
  const points = ok.reduce((s, r) => s + r.score!.points, 0);
  const max = mine.length
    ? mine.reduce((s, r) => s + (r.score?.maxPoints ?? maxPointsOf(r.preset)), 0)
    : 0;
  const times = ok.map((r) => r.ms).sort((a, b) => a - b);
  const fields = ok.flatMap((r) => r.score!.fields);
  const routes = ok.flatMap((r) => r.score!.routes);
  return {
    config: config.label,
    acerto: pct(points, max),
    tipos: `${ok.reduce((s, r) => s + r.score!.routes.length, 0)}/${mine.reduce((s, r) => s + expectedCount(r.preset), 0)}`,
    campos: `${fields.filter((f) => f.ok).length}/${fields.length}`,
    rotas: `${routes.filter((r) => r.ok).length}/${routes.length}`,
    extras: ok.reduce((s, r) => s + r.score!.extra.length, 0),
    indevidos: ok.reduce((s, r) => s + unsafe(r.score!), 0),
    rejeitados: mine.reduce((s, r) => s + r.rejected, 0),
    erros: mine.filter((r) => r.error && !r.score).length,
    mediana: times.length ? `${(times[Math.floor(times.length / 2)] / 1000).toFixed(1)} s` : "—",
    pior: times.length ? `${(times[times.length - 1] / 1000).toFixed(1)} s` : "—",
  };
});

/** Entraria no cadastro sem o gestor ver: evento a mais aplicado ou rota “aplica” onde devia revisar. */
function unsafe(score: Score) {
  return (
    score.extraApplied.length +
    score.routes.filter((x) => x.got === "aplica" && x.expected === "revisão").length
  );
}

function expectedCount(presetId: string) {
  return presets.find((p) => p.id === presetId)!.events.length;
}
function maxPointsOf(presetId: string) {
  const preset = presets.find((p) => p.id === presetId)!;
  return scoreExtraction(
    preset.events.map((e) => ({ type: e.type, confidence: e.confidence, data: e.data })),
    [],
    threshold,
  ).maxPoints;
}

console.table(summary);

if (args.includes("--salvar")) {
  const lines = [
    "# Avaliação da extração por IA",
    "",
    `Gerado por \`scripts/avaliar-extracao.ts\` em ${today}. Prompt \`${EXTRACTION_PROMPT_VERSION}\`, ` +
      `limiar de aplicação automática ${threshold}, ${runs} rodada(s) por conversa, ` +
      `${presets.length} conversas fictícias do simulador (o reenvio fica de fora: testa o endpoint, não a IA).`,
    "",
    "**Como a nota é calculada (por conversa):** 1 ponto por tipo de evento esperado que apareceu, " +
      "1 por campo-chave certo (valor do orçamento, placa, medida, data do agendamento, status…) e " +
      "1 se a rota (aplica sozinho × fila de revisão) bate com o gabarito. Eventos a mais não tiram " +
      "ponto, mas aparecem na coluna “extras”. **Indevidos** = eventos que entrariam no cadastro sem o gestor ver (evento a mais com confiança alta, ou rota “aplica” onde o gabarito pede revisão) — o erro que custa caro. Rejeitados = itens que a IA devolveu fora do contrato " +
      "e o pós-processamento descartou.",
    "",
    "## Resumo",
    "",
    "| Configuração | Acerto | Indevidos | Tipos | Campos-chave | Rotas | Extras | Rejeitados | Falhas | Mediana | Pior |",
    "|---|---|---|---|---|---|---|---|---|---|---|",
    ...summary.map(
      (s) =>
        `| ${s.config} | ${s.acerto} | ${s.indevidos} | ${s.tipos} | ${s.campos} | ${s.rotas} | ${s.extras} | ${s.rejeitados} | ${s.erros} | ${s.mediana} | ${s.pior} |`,
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
        r.rejected &&
          `${r.rejected} rejeitado(s) (${r.rejectedIssues.join("; ").replace(/\|/g, "/")})`,
        r.adjusted && `${r.adjusted} ajuste(s) do pós-processamento`,
        r.model && !r.config.includes(r.model) && `respondeu o modelo reserva ${r.model}`,
      ].filter(Boolean);
      return `| ${r.config} | ${r.preset} | ${s ? `${s.points}/${s.maxPoints}` : "—"} | ${(r.ms / 1000).toFixed(1)} s | ${notes.join("; ") || "ok"} |`;
    }),
    "",
  ];
  writeFileSync("docs/AVALIACAO_IA.md", lines.join("\n"));
  console.log("Relatório salvo em docs/AVALIACAO_IA.md");
}
