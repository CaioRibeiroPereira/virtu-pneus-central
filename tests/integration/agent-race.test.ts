// Corrida ao criar o cliente provisório (D51). O PGlite usa uma única conexão e não gera concorrência
// real; por isso a corrida é reproduzida de forma determinística: um trigger insere o mesmo telefone
// no instante entre a busca do endpoint (não achou ninguém) e a inserção do cliente provisório —
// exatamente o que acontece quando outra requisição da mesma conversa chega junto.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { count, eq, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { agentEvents, customers } from "@/db/schema";
import { handleAgentEvent } from "@/lib/agent/handler";
import { createTestDb } from "../helpers/db";

const TOKEN = "token-de-teste";
const PHONE_E164 = "+5519900000088";
let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await db.execute(sql`
    create function simula_requisicao_concorrente() returns trigger language plpgsql as $$
    begin
      -- só na inserção feita pelo endpoint (profundidade 1), não na que o próprio trigger faz
      if pg_trigger_depth() = 1 and new.phone_e164 = ${sql.raw(`'${PHONE_E164}'`)} then
        insert into customers (name, phone_e164, phone_display, is_provisional)
        values ('Criado pela outra requisição', new.phone_e164, new.phone_display, true);
      end if;
      return new;
    end $$`);
  await db.execute(sql`
    create trigger corrida before insert on customers
    for each row execute function simula_requisicao_concorrente()`);
});

afterAll(async () => close());

describe("eventos simultâneos de um telefone novo (D51)", () => {
  it("usa o cliente criado pela outra requisição em vez de responder 500", async () => {
    const res = await handleAgentEvent(
      {
        authorization: `Bearer ${TOKEN}`,
        contentType: "application/json",
        body: JSON.stringify({
          schema_version: "1.0",
          event_id: "corrida-1",
          type: "vehicle.identified",
          occurred_at: "2026-10-15T13:00:00-03:00",
          source: { channel: "whatsapp", conversation_id: "corrida", message_ids: [] },
          agent: { name: "vito-extrator", model: "teste", prompt_version: "v" },
          confidence: 0.95,
          customer: { phone: "(19) 90000-0088", name: "Tiago" },
          data: { model: "HB20" },
        }),
      },
      { token: TOKEN, threshold: 0.85, withDb: <T>(fn: (d: Db) => Promise<T>) => fn(db) },
    );

    expect(res.status).toBe(201);
    const rows = await db.select().from(customers).where(eq(customers.phoneE164, PHONE_E164));
    expect(rows).toHaveLength(1); // o índice único segurou a duplicata
    expect(rows[0].name).toBe("Criado pela outra requisição");
    expect(res.body.customer_id).toBe(rows[0].id); // o evento foi aplicado nesse cliente
    const [{ n }] = await db
      .select({ n: count() })
      .from(agentEvents)
      .where(eq(agentEvents.status, "aplicado"));
    expect(n).toBe(1);
  });
});
