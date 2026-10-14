// Telefones. O sistema identifica clientes pelo telefone em formato E.164 ("+5519988887777"),
// porque é assim que o WhatsApp entrega o número e porque o mesmo telefone pode ser digitado
// de vários jeitos ("(19) 98888-7777", "19988887777", "+55 19 98888 7777").
//
// Usa os metadados completos ("/max"): a versão padrão aceita números impossíveis,
// como "(19) 00000-1000" ou um fixo sem DDD.
import { parsePhoneNumberFromString } from "libphonenumber-js/max";

export type NormalizedPhone = {
  /** Formato internacional, usado como chave: "+5519988887777". */
  e164: string;
  /** Formato para exibir: "(19) 98888-7777" (ou internacional, se não for do Brasil). */
  display: string;
};

/** Normaliza um telefone digitado. Devolve `null` se não for um número válido. */
export function normalizePhone(input: string, defaultCountry: "BR" = "BR"): NormalizedPhone | null {
  const raw = input.trim();
  if (!raw) return null;
  // "5519988887777" (DDI sem "+") é comum em exportações do WhatsApp.
  const candidate =
    /^55\d{10,11}$/.test(raw.replace(/\D/g, "")) && !raw.startsWith("+")
      ? `+${raw.replace(/\D/g, "")}`
      : raw;
  const parsed = parsePhoneNumberFromString(candidate, defaultCountry);
  if (!parsed || !parsed.isValid()) return null;
  return {
    e164: parsed.number,
    display: parsed.country === "BR" ? parsed.formatNational() : parsed.formatInternational(),
  };
}

/** Link do WhatsApp com mensagem pronta. */
export function whatsappLink(e164: string, message?: string): string {
  const digits = e164.replace(/\D/g, "");
  return message
    ? `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
    : `https://wa.me/${digits}`;
}
