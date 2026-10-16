// Canal Telegram (D57) de ponta a ponta no banco (PGlite), com um "Telegram falso" que só registra
// o que seria enviado: aviso inicial, idempotência, telefone próprio × encaminhado, agendamento
// vindo do banco, nada inventado para preço, aviso ao dono e lote para a extração.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { appointments, customers, telegramChats, telegramMessages } from "@/db/schema";
import type { SendOptions, TelegramUpdate } from "@/lib/telegram/api";
import { IDLE_MS, markExtracted, readyConversations } from "@/lib/telegram/conversations";
import { handleTelegramUpdate } from "@/lib/telegram/handler";
import { resetDemoData } from "@/db/reset";
import { createTestDb } from "../helpers/db";

let db: Db;
let close: () => Promise<void>;
let customerId: string;
const NOW = new Date("2026-10-15T15:00:00Z"); // quinta, 12:00 na loja
const CHAT = 777001;
const USER = 777001;

const sent: { chatId: string; text: string; opts?: SendOptions }[] = [];
const owner: string[] = [];
const deps = (now = NOW) => ({
  db,
  now,
  appUrl: "https://virtu.example",
  shop: { name: "Virtù Pneus", address: "Rua Exemplo, 100", hours: "seg a sex, 8h às 18h" },
  send: async (chatId: string, text: string, opts?: SendOptions) => {
    sent.push({ chatId, text, opts });
  },
  notifyOwner: async (text: string) => {
    owner.push(text);
  },
});

let updateId = 1000;
const textUpdate = (text: string, id = ++updateId): TelegramUpdate => ({
  update_id: id,
  message: {
    message_id: id,
    from: { id: USER, first_name: "Tiago" },
    chat: { id: CHAT, type: "private" },
    date: 0,
    text,
  },
});
const contactUpdate = (phone: string, userId: number): TelegramUpdate => ({
  update_id: ++updateId,
  message: {
    message_id: updateId,
    from: { id: USER, first_name: "Tiago" },
    chat: { id: CHAT, type: "private" },
    date: 0,
    contact: { phone_number: phone, user_id: userId },
  },
});
const lastTexts = (n: number) => sent.slice(-n).map((s) => s.text);

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  [{ id: customerId }] = await db
    .insert(customers)
    .values({ name: "Tiago Mendes", phoneE164: "+5519900000040", phoneDisplay: "(19) 90000-0040" })
    .returning({ id: customers.id });
  await db.insert(appointments).values({
    customerId,
    serviceType: "alinhamento",
    status: "confirmado",
    scheduledAt: new Date("2026-10-17T12:00:00Z"), // sábado 09:00 na loja
  });
});
afterAll(() => close());

describe("bot da oficina no Telegram", () => {
  it("primeiro contato: avisa que é assistente automático e pede o telefone", async () => {
    const out = await handleTelegramUpdate(textUpdate("Oi"), deps());
    expect(out).toMatchObject({ status: "ok", intent: "saudacao", customerId: null });
    const [disclosure, ask] = lastTexts(2);
    expect(disclosure).toMatch(/assistente automático/);
    expect(ask).toMatch(/Compartilhar meu telefone/);
    expect(sent.at(-1)?.opts?.askContact).toBe(true);
    const [chat] = await db
      .select()
      .from(telegramChats)
      .where(eq(telegramChats.chatId, String(CHAT)));
    expect(chat.disclosedAt).not.toBeNull();
  });

  it("o mesmo update reenviado pelo Telegram não grava nem responde de novo", async () => {
    const before = sent.length;
    const u = textUpdate("qual o endereço?");
    expect((await handleTelegramUpdate(u, deps())).status).toBe("ok");
    expect((await handleTelegramUpdate(u, deps())).status).toBe("duplicate");
    expect(sent.length).toBe(before + 1);
    expect(sent.at(-1)?.text).toBe("Estamos em: Rua Exemplo, 100.");
  });

  it("contato encaminhado de OUTRA pessoa não liga a conversa a cadastro nenhum", async () => {
    await handleTelegramUpdate(contactUpdate("+55 19 90000-0040", 999), deps());
    const [chat] = await db
      .select()
      .from(telegramChats)
      .where(eq(telegramChats.chatId, String(CHAT)));
    expect(chat.customerId).toBeNull();
    expect(sent.at(-1)?.text).toMatch(/seu próprio número/);
  });

  it("o próprio telefone liga ao cadastro e avisa o dono", async () => {
    const out = await handleTelegramUpdate(contactUpdate("5519900000040", USER), deps());
    expect(out).toMatchObject({ status: "ok", customerId });
    expect(sent.at(-1)).toMatchObject({ text: "Obrigado, Tiago! Encontrei o seu cadastro." });
    expect(sent.at(-1)?.opts?.removeKeyboard).toBe(true);
    expect(owner.at(-1)).toMatch(/Tiago Mendes .*compartilhou o telefone/);
  });

  it("agendamento: responde com o que está no banco", async () => {
    await handleTelegramUpdate(textUpdate("como está meu agendamento?"), deps());
    expect(sent.at(-1)?.text).toBe(
      "Seu próximo agendamento: Alinhamento, sábado, 17/10 às 09:00 — confirmado. Para mudar, o dono te responde por aqui.",
    );
  });

  it("preço não é inventado: passa para o dono uma vez; depois, silêncio e aviso ao dono a cada mensagem", async () => {
    const before = sent.length;
    await handleTelegramUpdate(textUpdate("quanto custa o alinhamento?"), deps());
    await handleTelegramUpdate(
      textUpdate("e o balanceamento?"),
      deps(new Date(NOW.getTime() + 60_000)),
    );
    expect(sent.length).toBe(before + 1);
    expect(sent.at(-1)?.text).toMatch(/^Recebemos sua mensagem!/);
    expect(owner.at(-1)).toBe(
      `📩 Tiago Mendes (Telegram): “e o balanceamento?”\nResponder: https://virtu.example/clientes/${customerId}`,
    );
  });

  it("guarda a conversa inteira (cliente e Vito) para a ficha", async () => {
    const rows = await db
      .select()
      .from(telegramMessages)
      .where(eq(telegramMessages.chatId, String(CHAT)));
    expect(rows.filter((r) => r.author === "cliente").length).toBe(7);
    expect(rows.some((r) => r.author === "vito" && r.intent === "agendamento")).toBe(true);
  });
});

describe("conversa com o dono", () => {
  it("depois de 12 h sem resposta do dono, o Vito volta a responder o que é seguro", async () => {
    const later = new Date(NOW.getTime() + 13 * 60 * 60 * 1000);
    await handleTelegramUpdate(textUpdate("que horas vocês abrem?"), deps(later));
    expect(sent.at(-1)?.text).toBe("Nosso horário: seg a sex, 8h às 18h.");
  });
});

describe("lote para a extração (n8n)", () => {
  it("só entrega a conversa parada há 2 minutos, sem a marca do telefone", async () => {
    const all = await db.select().from(telegramMessages);
    const last = Math.max(...all.map((m) => m.createdAt.getTime()));
    expect(await readyConversations(db, new Date(last + 1000))).toEqual([]); // ainda conversando
    const [conv] = await readyConversations(db, new Date(last + IDLE_MS + 1000));
    expect(conv).toMatchObject({ chat_id: String(CHAT), phone: "+5519900000040" });
    expect(conv.conversation_id).toMatch(new RegExp(`^tg-${CHAT}-[0-9a-f]{8}$`));
    expect(conv.messages[0]).toEqual({ from: "cliente", text: "Oi" });
    expect(conv.messages.some((m) => m.text.includes("compartilhou"))).toBe(false);
    expect(conv.messages.some((m) => m.from === "vito")).toBe(true);
    expect(conv.message_ids.length).toBeLessThanOrEqual(50);

    // Depois da confirmação, o lote não volta.
    expect(await markExtracted(db, conv.chat_id, new Date(conv.ate))).toBeGreaterThan(0);
    expect(await readyConversations(db, new Date(last + IDLE_MS + 1000))).toEqual([]);
  });

  it("lote que termina numa mensagem do cliente (Vito em silêncio) também é confirmado", async () => {
    // O Postgres guarda microssegundos; o `ate` do JSON, milissegundos. Antes, a última mensagem
    // (…07.807180) ficava fora de "≤ …07.807" e o n8n extraía o mesmo lote a cada minuto.
    await db.insert(telegramMessages).values({
      chatId: String(CHAT),
      author: "cliente",
      text: "oi",
      createdAt: sql`date_trunc('second', now()) + interval '10.807180 seconds'`,
    });
    const later = new Date(Date.now() + 10_000 + IDLE_MS + 1000);
    const [conv] = await readyConversations(db, later);
    expect(conv.messages.at(-1)).toEqual({ from: "cliente", text: "oi" });
    expect(await markExtracted(db, conv.chat_id, new Date(conv.ate))).toBe(1);
    expect(await readyConversations(db, later)).toEqual([]);
  });
});

describe("Reiniciar demonstração", () => {
  it("não apaga as conversas do Telegram (canal real); só desfaz o atalho para o cliente", async () => {
    const before = (await db.select().from(telegramMessages)).length;
    await resetDemoData(db, "2026-10-15");
    const [chat] = await db
      .select()
      .from(telegramChats)
      .where(eq(telegramChats.chatId, String(CHAT)));
    expect(chat).toBeDefined();
    expect(chat.customerId).toBeNull();
    expect(chat.phoneE164).toBe("+5519900000040");
    expect((await db.select().from(telegramMessages)).length).toBe(before);
  });
});
