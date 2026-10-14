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
  },
});
