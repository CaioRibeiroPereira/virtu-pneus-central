import { describe, expect, it } from "vitest";
import { conversationChannel } from "@/lib/review/queries";

describe("canal da sugestão na Revisão", () => {
  it.each([
    ["tg-2110732003-e309530b", "Telegram"],
    ["sim-orcamento-cliente-novo-2026-10-16", "WhatsApp (simulador)"],
    ["conv-ricardo", "WhatsApp"],
    [null, "WhatsApp"],
  ])("%s → %s", (id, label) => {
    expect(conversationChannel(id)).toBe(label);
  });
});
