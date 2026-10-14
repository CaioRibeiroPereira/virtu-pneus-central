import { neon, neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle as drizzleHttp } from "drizzle-orm/neon-http";
import { drizzle as drizzleWs } from "drizzle-orm/neon-serverless";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import ws from "ws";
import * as schema from "./schema";

/**
 * Tipo comum a qualquer banco Postgres do Drizzle com o nosso schema.
 * Produção usa o Neon; os testes usam PGlite (Postgres em memória) — a lógica de negócio
 * recebe um `Db` e não sabe qual dos dois é.
 */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

function databaseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL não configurada. Copie .env.example para .env.local e preencha.");
  }
  return url;
}

let httpDb: ReturnType<typeof createHttpDb> | undefined;

function createHttpDb() {
  // Driver HTTP: cada consulta é uma requisição HTTPS, sem conexão aberta. Ótimo para leituras
  // e gravações de um comando só; não suporta transações interativas (D16).
  return drizzleHttp(neon(databaseUrl()), { schema });
}

/** Banco para leituras e gravações simples. Criação preguiçosa: o build não precisa da URL. */
export function getDb() {
  httpDb ??= createHttpDb();
  return httpDb;
}

/**
 * Executa `fn` com um banco que suporta transações de verdade (driver WebSocket do Neon).
 * A conexão vive só durante a chamada: em funções serverless ela não pode sobrar entre requisições.
 */
export async function withTransactionalDb<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  neonConfig.webSocketConstructor ??= ws;
  const pool = new Pool({ connectionString: databaseUrl() });
  try {
    return await fn(drizzleWs({ client: pool, schema }) as unknown as Db);
  } finally {
    await pool.end();
  }
}
