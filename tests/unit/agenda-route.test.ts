import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/agenda/hoje/route";

describe("GET /api/agenda/hoje", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("recusa sem token ou com token errado, antes de tocar no banco", async () => {
    vi.stubEnv("AGENT_API_TOKEN", "token-certo");
    for (const authorization of [null, "Bearer errado", "token-certo"]) {
      const headers = authorization ? { authorization } : undefined;
      const res = await GET(new Request("http://x/api/agenda/hoje", { headers }));
      expect(res.status).toBe(401);
    }
  });
});
