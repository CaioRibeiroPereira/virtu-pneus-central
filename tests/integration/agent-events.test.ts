// POST /api/agent-events de ponta a ponta (sem o Next): autenticação, validação, idempotência,
// matching por telefone, regra de confiança, alto impacto, conflito com edição humana e auditoria.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, count, desc, eq } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import type { Db } from "@/db";
import { agentEvents, auditLog, customers, quotes, reviewItems, tasks } from "@/db/schema";
import { handleAgentEvent, type AgentRequest } from "@/lib/agent/handler";
import { createTestDb } from "../helpers/db";

const TOKEN = "token-de-teste";
let db: Db;
let close: () => Promise<void>;
let ricardoId: string;
let quoteId: string;

const deps = () => ({
  token: TOKEN,
  threshold: 0.85,
  withDb: <T>(fn: (d: Db) => Promise<T>) => fn(db),
});

let seq = 0;
function event(
  type: string,
  data: Record<string, unknown>,
  overrides: Record<string, unknown> = {},
) {
  seq += 1;
  return {
    schema_version: "1.0",
    event_id: `teste-evento-${seq}`,
    type,
    occurred_at: "2026-10-14T13:05:00-03:00",
    source: { channel: "whatsapp", conversation_id: `conv-${seq}`, message_ids: [`m-${seq}`] },
    agent: { name: "vito-extrator", model: "gemini", prompt_version: "2026-10-14" },
    confidence: 0.92,
    evidence: "trecho da conversa",
    customer: { phone: "(19) 98888-7777", name: "Ricardo Alves" },
    data,
    ...overrides,
  };
}

function send(body: unknown, req: Partial<AgentRequest> = {}) {
  return handleAgentEvent(
    {
      authorization: `Bearer ${TOKEN}`,
      contentType: "application/json",
      body: typeof body === "string" ? body : JSON.stringify(body),
      ...req,
    },
    deps(),
  );
}

const total = async (table: PgTable) => (await db.select({ n: count() }).from(table))[0].n;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  const [ricardo] = await db
    .insert(customers)
    .values({
      name: "Ricardo Alves",
      phoneE164: "+5519988887777",
      phoneDisplay: "(19) 98888-7777",
      city: "Sumaré",
      humanEditedFields: ["city"],
    })
    .returning();
  ricardoId = ricardo.id;
  const [q] = await db
    .insert(quotes)
    .values({
      customerId: ricardoId,
      description: "4 pneus 205/55 R16",
      total: 1840,
      status: "enviado",
      sentAt: new Date("2026-10-09T13:00:00Z"),
    })
    .returning();
  quoteId = q.id;
});

afterAll(() => close());

describe("1–2. autenticação e validação", () => {
  it("401 sem token ou com token errado", async () => {
    expect((await send(event("interaction.logged", {}), { authorization: null })).status).toBe(401);
    expect(
      (await send(event("interaction.logged", {}), { authorization: "Bearer errado" })).status,
    ).toBe(401);
  });

  it("415 se não for JSON e 413 se o corpo passar de 64 KB", async () => {
    expect((await send("{}", { contentType: "text/plain" })).status).toBe(415);
    expect((await send("x".repeat(70 * 1024))).status).toBe(413);
  });

  it("422 com a lista de campos inválidos", async () => {
    const bad = await send(event("quote.created", { description: "x" }, { confidence: 2 }));
    expect(bad.status).toBe(422);
    const paths = (bad.body.issues as { path: string }[]).map((i) => i.path);
    expect(paths).toEqual(expect.arrayContaining(["confidence", "data.total"]));
    expect((await send("{nao é json")).status).toBe(422);
    expect((await send(event("tipo.inexistente", {}))).status).toBe(422);
  });
});

describe("3. idempotência", () => {
  it("o mesmo event_id enviado duas vezes produz um único efeito", async () => {
    const e = event("interaction.logged", { summary: "Perguntou do prazo", channel: "whatsapp" });
    const before = await total(agentEvents);
    expect((await send(e)).status).toBe(201);
    const again = await send(e);
    expect(again.status).toBe(200);
    expect(again.body.status).toBe("duplicate");
    expect(await total(agentEvents)).toBe(before + 1);
  });
});

describe("4–6. matching, decisão e aplicação", () => {
  it("aplica orçamento de baixo risco com confiança alta: grava, audita e gera a tarefa R1", async () => {
    const res = await send(
      event(
        "quote.created",
        { description: "2 pneus 185/60 R15", total: 898 },
        { customer: { phone: "+55 19 98888-7777" } }, // outro formato do mesmo telefone
      ),
    );
    expect(res.status).toBe(201);
    const [applied] = res.body.applied as { entity: string; id: string }[];
    expect(applied.entity).toBe("quote");

    const [q] = await db.select().from(quotes).where(eq(quotes.id, applied.id));
    expect(q).toMatchObject({
      customerId: ricardoId,
      status: "enviado",
      source: "agente",
      total: 898,
    });
    const [ev] = await db.select().from(agentEvents).where(eq(agentEvents.id, q.agentEventId!));
    expect(ev.status).toBe("aplicado");
    const audits = await db.select().from(auditLog).where(eq(auditLog.entityId, q.id));
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ actorType: "agente", action: "create" });
    const r1 = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.quoteId, q.id), eq(tasks.autoRule, "R1")));
    expect(r1).toHaveLength(1);
  });

  it("número desconhecido + baixo risco + confiança alta → cria cliente provisório", async () => {
    const res = await send(
      event(
        "interaction.logged",
        { summary: "Quer pneu aro 15", channel: "whatsapp" },
        {
          customer: { phone: "(19) 97777-1111", name: "Bruna" },
        },
      ),
    );
    expect(res.status).toBe(201);
    const [c] = await db.select().from(customers).where(eq(customers.phoneE164, "+5519977771111"));
    expect(c).toMatchObject({ name: "Bruna", isProvisional: true, source: "agente" });
  });

  it("número desconhecido + confiança baixa → revisão (cliente não encontrado), sem criar cliente", async () => {
    const before = await total(customers);
    const res = await send(
      event(
        "interaction.logged",
        { summary: "vcs tem aro 15?", channel: "whatsapp" },
        {
          confidence: 0.4,
          customer: { phone: "(19) 96666-2222" },
        },
      ),
    );
    expect(res.status).toBe(202);
    expect(res.body.reason).toBe("cliente_nao_encontrado");
    expect(await total(customers)).toBe(before);
  });

  it("telefone inválido → revisão", async () => {
    const res = await send(
      event(
        "interaction.logged",
        { summary: "oi", channel: "whatsapp" },
        { customer: { phone: "123" } },
      ),
    );
    expect(res.body.reason).toBe("cliente_nao_encontrado");
  });

  it("cliente encontrado + confiança abaixo do limiar → revisão (baixa confiança)", async () => {
    const res = await send(
      event(
        "task.suggested",
        { type: "outro", title: "Ligar", reason: "Pediu retorno", due_date: "2026-10-15" },
        { confidence: 0.6 },
      ),
    );
    expect(res.status).toBe(202);
    expect(res.body.reason).toBe("baixa_confianca");
  });

  it("aprovação de orçamento é alto impacto: vai para revisão mesmo com confiança 0,99", async () => {
    const res = await send(
      event(
        "quote.status_changed",
        { status: "aprovado", quote_id: quoteId },
        { confidence: 0.99 },
      ),
    );
    expect(res.status).toBe(202);
    expect(res.body.reason).toBe("alto_impacto");
    const [q] = await db.select().from(quotes).where(eq(quotes.id, quoteId));
    expect(q.status).toBe("enviado"); // nada mudou sem o gestor
    const [review] = await db
      .select()
      .from(reviewItems)
      .where(eq(reviewItems.id, res.body.review_id as string));
    expect(review.proposed).toMatchObject({ quoteId }); // já aponta o orçamento alvo
  });

  it("sem quote_id, o alvo é o orçamento enviado mais recente do cliente", async () => {
    const [latest] = await db
      .select({ id: quotes.id })
      .from(quotes)
      .where(and(eq(quotes.customerId, ricardoId), eq(quotes.status, "enviado")))
      .orderBy(desc(quotes.sentAt))
      .limit(1);
    const res = await send(
      event("quote.status_changed", { status: "recusado", reason: "Achou caro" }),
    );
    const [review] = await db
      .select()
      .from(reviewItems)
      .where(eq(reviewItems.id, res.body.review_id as string));
    expect(latest.id).not.toBe(quoteId); // o teste anterior criou um orçamento mais novo
    expect(review.proposed).toMatchObject({ quoteId: latest.id });
  });

  it("serviço realizado é alto impacto", async () => {
    const res = await send(
      event("service.completed", {
        type: "troca_pneus",
        description: "Troca de 4 pneus",
        performed_at: "2026-10-14T15:00:00-03:00",
      }),
    );
    expect(res.body.reason).toBe("alto_impacto");
  });

  it("conflito com campo editado pelo gestor → revisão; campo vazio é preenchido", async () => {
    const conflict = await send(event("customer.upserted", { city: "Hortolândia" }));
    expect(conflict.status).toBe(202);
    expect(conflict.body.reason).toBe("conflito_edicao_humana");

    const fill = await send(event("customer.upserted", { email: "ricardo@example.com" }));
    expect(fill.status).toBe(201);
    const [c] = await db.select().from(customers).where(eq(customers.id, ricardoId));
    expect(c.email).toBe("ricardo@example.com");
    expect(c.city).toBe("Sumaré"); // o que o gestor editou não muda
  });
});
