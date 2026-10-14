import { defineConfig } from "@playwright/test";

// Lê .env.local (senha da demo) quando existir; em CI as variáveis vêm do ambiente.
try {
  process.loadEnvFile(".env.local");
} catch {}

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    // Usa o Google Chrome já instalado na máquina (não baixa navegadores).
    channel: "chrome",
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run start -- -p 3000",
        url: "http://localhost:3000/login",
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
