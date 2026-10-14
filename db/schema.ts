import { integer, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import type { Client } from "@/lib/crm";

// Tabela herdada do protótipo: o cliente inteiro num JSON.
// Provisória — a Fase 1 substitui por tabelas normalizadas (PLANO_DESENVOLVIMENTO.md §6).
export const customers = pgTable("customers", {
  id: text("id").primaryKey(),
  data: jsonb("data").$type<Client>().notNull(),
  revision: integer("revision").notNull().default(1),
});
