// Datas da loja. Regra (D11): o banco guarda instantes em UTC (timestamptz);
// "hoje", vencimentos e exibição usam o fuso da loja. Datas sem hora (ex.: vencimento
// de tarefa) são strings "AAAA-MM-DD" que representam o dia da loja.

export const STORE_TIMEZONE = "America/Sao_Paulo";

/** Data "AAAA-MM-DD", sem hora, no calendário da loja. */
export type DateOnly = string;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Dia da loja ("AAAA-MM-DD") em que o instante `now` cai. */
export function todayInStore(now: Date = new Date(), timeZone = STORE_TIMEZONE): DateOnly {
  // en-CA formata como AAAA-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function assertDateOnly(date: DateOnly) {
  if (!DATE_ONLY.test(date)) throw new Error(`Data inválida (esperado AAAA-MM-DD): ${date}`);
}

/** Soma dias a uma data sem hora. Usa aritmética em UTC, então não sofre com fuso. */
export function addDays(date: DateOnly, days: number): DateOnly {
  assertDateOnly(date);
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Diferença em dias de calendário: `to - from` (positivo se `to` é depois). */
export function diffInDays(from: DateOnly, to: DateOnly): number {
  assertDateOnly(from);
  assertDateOnly(to);
  const toUtc = (s: DateOnly) => {
    const [y, m, d] = s.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(to) - toUtc(from)) / 86_400_000);
}

/** Deslocamento do fuso em relação a UTC, em minutos, no instante dado (ex.: -180). */
function offsetMinutes(instant: Date, timeZone: string): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
    .formatToParts(instant)
    .find((p) => p.type === "timeZoneName")?.value; // "GMT-03:00" ou "GMT"
  const match = name?.match(/GMT([+-])(\d{2}):(\d{2})/);
  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3]));
}

/** Converte "dia + hora no relógio da loja" para o instante em UTC. Ex.: 14/10 09:00 → 12:00Z. */
export function storeTimeToUtc(date: DateOnly, time: string, timeZone = STORE_TIMEZONE): Date {
  assertDateOnly(date);
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const asIfUtc = Date.UTC(y, m - 1, d, hh, mm);
  // Corrige pelo deslocamento do fuso; a segunda passada cobre mudanças de horário de verão.
  let result = asIfUtc - offsetMinutes(new Date(asIfUtc), timeZone) * 60_000;
  result = asIfUtc - offsetMinutes(new Date(result), timeZone) * 60_000;
  return new Date(result);
}

/** Dia da loja em que um instante cai (ex.: para saber se um agendamento é "hoje"). */
export function storeDateOf(instant: Date, timeZone = STORE_TIMEZONE): DateOnly {
  return todayInStore(instant, timeZone);
}

/** "14/10/2026" para uma data sem hora. */
export function formatDate(date: DateOnly): string {
  assertDateOnly(date);
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
}

/** "14/10/2026, 09:05" no fuso da loja. */
export function formatDateTime(instant: Date, timeZone = STORE_TIMEZONE): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(instant);
}

/** "09:05" no fuso da loja. */
export function formatTime(instant: Date, timeZone = STORE_TIMEZONE): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone, hour: "2-digit", minute: "2-digit" }).format(
    instant,
  );
}

/** Texto curto de prazo: "vence hoje", "atrasado há 3 dias", "vence em 2 dias". */
export function describeDue(due: DateOnly, today: DateOnly): string {
  const days = diffInDays(today, due);
  if (days === 0) return "vence hoje";
  if (days === 1) return "vence amanhã";
  if (days > 1) return `vence em ${days} dias`;
  return days === -1 ? "atrasado há 1 dia" : `atrasado há ${-days} dias`;
}

/** "Quinta-feira, 15 de outubro" (tela Hoje e resumo diário). */
export function formatLongDate(date: DateOnly): string {
  assertDateOnly(date);
  const text = new Date(`${date}T12:00:00Z`).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
  return text.charAt(0).toUpperCase() + text.slice(1);
}
