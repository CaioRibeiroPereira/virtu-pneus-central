import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    // Os primeiros testes chegam na Fase 1 (lib/dates, lib/phone, lib/search).
    passWithNoTests: true,
    // Cada arquivo de integração sobe um Postgres em memória (PGlite) com as migrações e o seed no
    // beforeAll; com a suíte inteira em paralelo isso passava dos 10 s padrão.
    hookTimeout: 60_000,
  },
});
