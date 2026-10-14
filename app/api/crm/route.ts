import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { customers } from "@/db/schema";
import { seed } from "@/lib/crm";
import { customerInput } from "@/lib/validation";

// API herdada do protótipo, portada de D1 para Postgres sem mudar o comportamento.
// Ainda sem autenticação: a Fase 2 protege tudo (PLANO_DESENVOLVIMENTO.md §3, item 1).

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = getDb();
    await db
      .insert(customers)
      .values(seed().map((c) => ({ id: c.id, data: { ...c, revision: 1 }, revision: 1 })))
      .onConflictDoNothing();
    const rows = await db.select().from(customers);
    return Response.json({ clients: rows.map((r) => ({ ...r.data, revision: r.revision })) });
  } catch (e) {
    console.error(e);
    return Response.json(
      { error: "Não foi possível carregar os clientes. Tente novamente." },
      { status: 503 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const origin = req.headers.get("origin");
    if (origin && origin !== url.origin)
      return Response.json({ error: "Origem inválida" }, { status: 403 });

    const raw = await req.text();
    if (raw.length > 200_000)
      return Response.json({ error: "Cadastro muito grande." }, { status: 413 });

    let input: unknown;
    try {
      input = JSON.parse(raw);
    } catch {
      return Response.json({ error: "Dados inválidos." }, { status: 400 });
    }
    const parsed = customerInput.safeParse(input);
    if (!parsed.success) {
      return Response.json(
        { error: "Confira os campos do cadastro e o motivo de perda, quando aplicável." },
        { status: 400 },
      );
    }

    const c = parsed.data;
    const next = { ...c, revision: c.revision + 1 };
    const db = getDb();
    // Trava otimista: só grava se ninguém alterou o registro desde que ele foi lido.
    const written =
      c.revision === 0
        ? await db
            .insert(customers)
            .values({ id: c.id, data: next, revision: 1 })
            .onConflictDoNothing()
            .returning({ id: customers.id })
        : await db
            .update(customers)
            .set({ data: next, revision: c.revision + 1 })
            .where(and(eq(customers.id, c.id), eq(customers.revision, c.revision)))
            .returning({ id: customers.id });

    if (!written.length) {
      return Response.json(
        { error: "Este cadastro foi atualizado em outra tela. Recarregue antes de salvar." },
        { status: 409 },
      );
    }
    return Response.json({ client: next });
  } catch (e) {
    console.error(e);
    return Response.json(
      { error: "Não foi possível salvar. Seus dados continuam no formulário." },
      { status: 503 },
    );
  }
}
