import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

function createDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL não configurada. Copie .env.example para .env.local e preencha.");
  }
  // Driver HTTP do Neon: cada consulta é uma requisição HTTPS, sem conexão persistente,
  // o que combina com funções serverless da Vercel.
  return drizzle(neon(url), { schema });
}

let db: ReturnType<typeof createDb> | undefined;

// Criação preguiçosa: o build não precisa da variável de ambiente, só quem consulta o banco.
export function getDb() {
  db ??= createDb();
  return db;
}
