import { describe, expect, it } from "vitest";
import { normalizePhone, whatsappLink } from "@/lib/phone";

describe("normalizePhone", () => {
  it.each([
    "(19) 98888-7777",
    "19 98888-7777",
    "19988887777",
    "+55 19 98888-7777",
    "5519988887777", // DDI sem "+", como vem em exportações do WhatsApp
    "  (19)98888 7777  ",
  ])("normaliza %j para o mesmo E.164", (input) => {
    expect(normalizePhone(input)).toEqual({ e164: "+5519988887777", display: "(19) 98888-7777" });
  });

  it("aceita telefone fixo com DDD", () => {
    expect(normalizePhone("(19) 3232-1000")?.e164).toBe("+551932321000");
  });

  it("aceita número estrangeiro com DDI", () => {
    expect(normalizePhone("+1 415 555 2671")?.e164).toBe("+14155552671");
  });

  it.each(["", "abc", "3232-1000" /* sem DDD */, "(19) 00000-1000" /* inexistente */, "123"])(
    "rejeita %j",
    (input) => {
      expect(normalizePhone(input)).toBeNull();
    },
  );
});

describe("whatsappLink", () => {
  it("monta o link só com dígitos e a mensagem codificada", () => {
    expect(whatsappLink("+5519988887777", "Olá, tudo bem?")).toBe(
      "https://wa.me/5519988887777?text=Ol%C3%A1%2C%20tudo%20bem%3F",
    );
    expect(whatsappLink("+5519988887777")).toBe("https://wa.me/5519988887777");
  });
});
