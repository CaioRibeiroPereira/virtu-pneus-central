import { defineConfig } from "drizzle-kit";

// O drizzle-kit não lê .env.local sozinho; em CI/Vercel a variável já vem do ambiente.
try {
  process.loadEnvFile(".env.local");
} catch {}

export default defineConfig({
  out: "./drizzle",
  schema: "./db/schema.ts",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
