import { describe, expect, it } from "vitest";
import {
  bearerMatches,
  createSessionToken,
  passwordMatches,
  SESSION_TTL_MS,
  verifySessionToken,
} from "@/lib/auth/token";
import { safeNextPath } from "@/lib/auth/redirect";

const SECRET = "segredo-de-teste";

describe("sessão assinada", () => {
  it("aceita o token que ela mesma gerou", async () => {
    const { token } = await createSessionToken(SECRET, 1_000);
    expect(await verifySessionToken(token, SECRET, 2_000)).toBe(true);
  });

  it("recusa token expirado (7 dias)", async () => {
    const { token } = await createSessionToken(SECRET, 0);
    expect(await verifySessionToken(token, SECRET, SESSION_TTL_MS + 1)).toBe(false);
  });

  it("recusa token com validade adulterada", async () => {
    const { token } = await createSessionToken(SECRET, 0);
    const [v, exp, sig] = token.split(".");
    const forged = `${v}.${Number(exp) + 10 * SESSION_TTL_MS}.${sig}`;
    expect(await verifySessionToken(forged, SECRET, 1)).toBe(false);
  });

  it("recusa token assinado com outro segredo, vazio ou malformado", async () => {
    const { token } = await createSessionToken("outro-segredo", 0);
    expect(await verifySessionToken(token, SECRET, 1)).toBe(false);
    expect(await verifySessionToken(undefined, SECRET)).toBe(false);
    expect(await verifySessionToken("lixo", SECRET)).toBe(false);
    expect(await verifySessionToken(token, "", 1)).toBe(false);
  });
});

describe("senha e token dos agentes", () => {
  it("confere a senha do gestor", async () => {
    expect(await passwordMatches("certa", "certa", SECRET)).toBe(true);
    expect(await passwordMatches("errada", "certa", SECRET)).toBe(false);
    expect(await passwordMatches("", "", SECRET)).toBe(false); // senha não configurada
  });

  it("confere o Bearer token", () => {
    expect(bearerMatches("Bearer abc123", "abc123")).toBe(true);
    expect(bearerMatches("Bearer abc124", "abc123")).toBe(false);
    expect(bearerMatches("abc123", "abc123")).toBe(false);
    expect(bearerMatches(null, "abc123")).toBe(false);
    expect(bearerMatches("Bearer ", undefined)).toBe(false);
  });
});

describe("safeNextPath", () => {
  it.each([
    ["/clientes/123?aba=historico", "/clientes/123?aba=historico"],
    ["https://site-malicioso.com", "/"],
    ["//site-malicioso.com", "/"],
    ["/login", "/"],
    [undefined, "/"],
  ])("%j → %j", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });
});
