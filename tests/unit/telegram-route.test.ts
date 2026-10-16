import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/telegram/webhook/route";

const req = (headers?: Record<string, string>) =>
  new Request("http://x/api/telegram/webhook", { method: "POST", headers, body: "{}" });

describe("POST /api/telegram/webhook", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("sem bot configurado: 503", async () => {
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "");
    vi.stubEnv("TELEGRAM_CLIENTE_BOT_TOKEN", "");
    expect((await POST(req())).status).toBe(503);
  });

  it("sem o segredo do Telegram, ou com o segredo errado: 401 (antes de tocar no banco)", async () => {
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "segredo-certo");
    vi.stubEnv("TELEGRAM_CLIENTE_BOT_TOKEN", "123:abc");
    expect((await POST(req())).status).toBe(401);
    expect((await POST(req({ "x-telegram-bot-api-secret-token": "errado" }))).status).toBe(401);
  });
});
