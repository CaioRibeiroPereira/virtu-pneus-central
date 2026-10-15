// Nota da extração feita pela IA contra o gabarito das conversas do simulador (D42).
// Função pura: o script scripts/avaliar-extracao.ts chama os provedores e usa esta comparação.
import { HIGH_RISK_TYPES, type AgentEvent, type AgentEventType } from "./schema";
import { normalizeText } from "@/lib/search";

export type ExpectedEvent = { type: string; confidence: number; data: Record<string, unknown> };
export type Route = "aplica" | "revisão";

export type FieldCheck = {
  type: string;
  field: string;
  expected: unknown;
  got: unknown;
  ok: boolean;
};

export type Score = {
  missing: string[];
  extra: string[];
  /** Eventos fora do gabarito que seriam aplicados SEM passar pelo gestor (o erro que custa caro). */
  extraApplied: string[];
  fields: FieldCheck[];
  routes: { type: string; expected: Route; got: Route; ok: boolean }[];
  /** Tipos esperados encontrados + campos-chave certos + rotas certas, sobre o total possível. */
  points: number;
  maxPoints: number;
};

/** Para onde o evento iria pela confiança e pelo risco (o endpoint ainda checa o cliente). */
export function routeOf(type: string, confidence: number, threshold: number): Route {
  return confidence >= threshold && !HIGH_RISK_TYPES.has(type as AgentEventType)
    ? "aplica"
    : "revisão";
}

const compact = (v: unknown) => normalizeText(String(v ?? "")).replace(/[\s-]/g, "");
const sameName = (a: unknown, b: unknown) => {
  const [x, y] = [compact(a), compact(b)];
  return !!x && !!y && (x.includes(y) || y.includes(x)); // "Mariana" bate com "Mariana Lopes"
};
const sameInstant = (a: unknown, b: unknown) =>
  Date.parse(String(a)) === Date.parse(String(b)) && !Number.isNaN(Date.parse(String(a)));

/** Campos que importam para o gestor em cada tipo (texto livre, como resumos, fica de fora). */
const KEY_FIELDS: Record<string, Record<string, (e: unknown, g: unknown) => boolean>> = {
  "customer.upserted": { name: sameName },
  "vehicle.identified": {
    plate: (e, g) => compact(e) === compact(g),
    year: (e, g) => e === g,
    tire_size: (e, g) => compact(e) === compact(g),
  },
  "quote.created": { total: (e, g) => e === g, quantity: (e, g) => e === g },
  "quote.status_changed": { status: (e, g) => e === g },
  "appointment.requested": { scheduled_at: sameInstant, service_type: (e, g) => e === g },
  "interaction.logged": { channel: (e, g) => e === g },
  "task.suggested": { type: (e, g) => e === g, due_date: (e, g) => e === g },
  "service.completed": { type: (e, g) => e === g, total: (e, g) => e === g },
};

export function scoreExtraction(
  expected: ExpectedEvent[],
  got: AgentEvent[],
  threshold: number,
): Score {
  const gotByType = new Map<string, AgentEvent>();
  for (const event of got) if (!gotByType.has(event.type)) gotByType.set(event.type, event);
  const expectedTypes = new Set(expected.map((e) => e.type));

  const missing: string[] = [];
  const fields: FieldCheck[] = [];
  const routes: Score["routes"] = [];
  let points = 0;
  let maxPoints = 0;

  for (const exp of expected) {
    const match = gotByType.get(exp.type);
    const checks = Object.entries(KEY_FIELDS[exp.type] ?? {}).filter(
      ([field]) => exp.data[field] !== undefined,
    );
    maxPoints += 1 + checks.length + 1; // tipo + campos-chave + rota
    if (!match) {
      missing.push(exp.type);
      continue;
    }
    points += 1;
    const data = match.data as Record<string, unknown>;
    for (const [field, same] of checks) {
      const ok = same(exp.data[field], data[field]);
      fields.push({ type: exp.type, field, expected: exp.data[field], got: data[field], ok });
      if (ok) points += 1;
    }
    const route = {
      type: exp.type,
      expected: routeOf(exp.type, exp.confidence, threshold),
      got: routeOf(match.type, match.confidence, threshold),
      ok: false,
    };
    route.ok = route.expected === route.got;
    routes.push(route);
    if (route.ok) points += 1;
  }

  const extraEvents = got.filter((e) => !expectedTypes.has(e.type));
  const extra = extraEvents.map((e) => e.type);
  const extraApplied = extraEvents
    .filter((e) => routeOf(e.type, e.confidence, threshold) === "aplica")
    .map((e) => e.type);
  return { missing, extra, extraApplied, fields, routes, points, maxPoints };
}
