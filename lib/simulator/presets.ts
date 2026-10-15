// Conversas fictícias do simulador (§12.3), lidas de simulator/presets/*.json.
// Os eventos dos arquivos têm só o essencial; aqui eles ganham o envelope do §8.1 e as datas
// relativas a hoje. O event_id é estável por conversa e por dia: reenviar a mesma conversa
// demonstra a idempotência ("duplicate"), e "Reiniciar demonstração" permite processar de novo.
import p1 from "@/simulator/presets/1-orcamento-cliente-novo.json";
import p2 from "@/simulator/presets/2-aprova-orcamento.json";
import p3 from "@/simulator/presets/3-agenda-alinhamento.json";
import p4 from "@/simulator/presets/4-reclamacao-pos-troca.json";
import p5 from "@/simulator/presets/5-numero-desconhecido.json";
import p6 from "@/simulator/presets/6-reenvio.json";
import { addDays, storeTimeToUtc, type DateOnly } from "@/lib/dates";

export type PresetMessage = { from: string; text: string };
type PresetEvent = {
  type: string;
  confidence: number;
  evidence?: string;
  customer: { phone: string; name?: string };
  data: Record<string, unknown>;
};
export type Preset = {
  id: string;
  title: string;
  expected: string;
  phone: string;
  messages: PresetMessage[];
  events: PresetEvent[];
  replays?: string;
};

export const PRESETS: Preset[] = [p1, p2, p3, p4, p5, p6] as Preset[];

/** Próximo sábado depois de `today` (nunca o próprio dia). */
export function nextSaturday(today: DateOnly): DateOnly {
  const [y, m, d] = today.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = domingo, 6 = sábado
  return addDays(today, (6 - weekday + 7) % 7 || 7);
}

/** Próximo dia da semana `weekday` (0 = domingo … 6 = sábado) depois de `today` (nunca o próprio dia). */
export function nextWeekday(today: DateOnly, weekday: number): DateOnly {
  const [y, m, d] = today.split("-").map(Number);
  const current = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return addDays(today, (weekday - current + 7) % 7 || 7);
}

/**
 * Troca os marcadores de data dos arquivos: $TODAY, $TODAY+N, $NOW, $TODAY+N@HH:MM,
 * $NEXT_SATURDAY@HH:MM e $NEXT_DOW:N@HH:MM (N = dia da semana, 0 = domingo).
 */
export function resolvePlaceholders(value: unknown, today: DateOnly, now: Date): unknown {
  if (typeof value === "string") {
    if (value === "$TODAY") return today;
    if (value === "$NOW") return now.toISOString();
    const plus = value.match(/^\$TODAY\+(\d+)$/);
    if (plus) return addDays(today, Number(plus[1]));
    const plusAt = value.match(/^\$TODAY\+(\d+)@(\d{2}:\d{2})$/);
    if (plusAt) return storeTimeToUtc(addDays(today, Number(plusAt[1])), plusAt[2]).toISOString();
    const sat = value.match(/^\$NEXT_SATURDAY@(\d{2}:\d{2})$/);
    if (sat) return storeTimeToUtc(nextSaturday(today), sat[1]).toISOString();
    const dow = value.match(/^\$NEXT_DOW:([0-6])@(\d{2}:\d{2})$/);
    if (dow) return storeTimeToUtc(nextWeekday(today, Number(dow[1])), dow[2]).toISOString();
    return value;
  }
  if (Array.isArray(value)) return value.map((v) => resolvePlaceholders(v, today, now));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, resolvePlaceholders(v, today, now)]),
    );
  }
  return value;
}

/** Eventos completos (envelope §8.1) que o Vito geraria para a conversa. */
export function buildPresetEvents(presetId: string, today: DateOnly, now = new Date()) {
  const preset = PRESETS.find((p) => p.id === presetId);
  if (!preset) throw new Error(`Conversa não encontrada: ${presetId}`);
  const source = preset.replays ? PRESETS.find((p) => p.id === preset.replays)! : preset;
  return source.events.map((e, index) => ({
    schema_version: "1.0",
    event_id: `sim-${source.id}-${index + 1}-${today}`,
    type: e.type,
    occurred_at: now.toISOString(),
    source: {
      channel: "whatsapp",
      conversation_id: `sim-${source.id}-${today}`,
      message_ids: source.messages.map((_, i) => `sim-${source.id}-msg-${i + 1}`),
    },
    agent: { name: "vito-extrator", model: "simulador", prompt_version: "presets-v1" },
    confidence: e.confidence,
    ...(e.evidence ? { evidence: e.evidence } : {}),
    customer: e.customer,
    data: resolvePlaceholders(e.data, today, now) as Record<string, unknown>,
  }));
}
