// Estratégias de extração comparadas no banco de testes (D52). Todas devolvem o mesmo
// {"events": [...]} bruto, que passa pelo mesmo postProcess.
import { buildPrompt, extractionJsonSchema, itemJsonSchema } from "./extraction";
import {
  buildClassifyPrompt,
  buildTypePrompt,
  CLASSIFY_SCHEMA,
  mergeTypeOutputs,
  parseTypes,
} from "./focused";
import type { LlmCall, LlmResult } from "./llm";
import { parseExtraction } from "./refine";
import type { ConversationMessage } from "./prompt";
import { applyVerdicts, buildVerifyPrompt, parseVerdict, VERIFY_SCHEMA } from "./verify";

export const MODES = [
  "direto",
  "direto+dicas",
  "direto+verif",
  "direto+dicas+verif",
  "focado",
  "focado+dicas",
] as const;
export type Mode = (typeof MODES)[number];

export type ExtractionRun = {
  raw: unknown;
  ms: number;
  model: string;
  calls: number;
  /** Tipos apontados pela classificação (só no modo focado). */
  types?: string[];
  /** Eventos que a verificação reprovou (modos +verif). */
  rejectedByVerifier?: number;
};

export async function runExtraction(
  mode: Mode,
  call: (c: LlmCall) => Promise<LlmResult>,
  input: { messages: ConversationMessage[]; today: string },
): Promise<ExtractionRun> {
  const hints = mode.includes("+dicas");
  if (mode.startsWith("direto")) {
    const r = await call({ ...buildPrompt({ ...input, hints }), schema: extractionJsonSchema() });
    if (!mode.endsWith("+verif")) return { raw: r.text, ms: r.ms, model: r.model, calls: 1 };
    // Verificação: uma pergunta sim/não por evento; reprovado cai para a Revisão.
    const parsed = parseExtraction(r.text);
    if ("error" in parsed) return { raw: r.text, ms: r.ms, model: r.model, calls: 1 };
    const events = parsed.events as Parameters<typeof applyVerdicts>[0];
    let ms = r.ms;
    const verdicts = [];
    for (const event of events) {
      const v = await call({
        ...buildVerifyPrompt({ messages: input.messages, event }),
        schema: VERIFY_SCHEMA,
      });
      ms += v.ms;
      verdicts.push(parseVerdict(v.text));
    }
    return {
      raw: { events: applyVerdicts(events, verdicts) },
      ms,
      model: r.model,
      calls: 1 + events.length,
      rejectedByVerifier: verdicts.filter((v) => !v.sustained).length,
    };
  }
  const first = await call({
    ...buildClassifyPrompt({ ...input, hints }),
    schema: CLASSIFY_SCHEMA,
  });
  const types = parseTypes(first.text);
  let ms = first.ms;
  const outputs = [];
  for (const type of types) {
    // Um tipo por vez: o Ollama na CPU processa um pedido de cada vez de qualquer forma.
    const r = await call({
      ...buildTypePrompt({ ...input, type, hints }),
      schema: itemJsonSchema(type),
    });
    ms += r.ms;
    outputs.push({ type, text: r.text });
  }
  return { raw: mergeTypeOutputs(outputs), ms, model: first.model, calls: 1 + types.length, types };
}
