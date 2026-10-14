// Busca de clientes tolerante ao jeito que o dono digita (§7.3 do plano):
// sem acento e sem maiúsculas ("andre" acha "André"), telefone por dígitos
// ("1998888" acha "(19) 98888-7777") e placa sem traço ("abc1d23" acha "ABC-1D23").

/** Minúsculas, sem acentos e com espaços simples. */
export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

/** Placa em maiúsculas, só letras e números: "abc-1d23" → "ABC1D23". */
export function normalizePlate(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export type Searchable = {
  name: string;
  phoneE164?: string | null;
  email?: string | null;
  plates?: string[];
};

/** Quantos dígitos a busca precisa ter para ser tratada como telefone. */
const MIN_PHONE_DIGITS = 4;

/** Verifica se um cliente corresponde ao texto buscado. Busca vazia corresponde a todos. */
export function matchesSearch(customer: Searchable, query: string): boolean {
  const text = normalizeText(query);
  if (!text) return true;

  // Nome/e-mail: todas as palavras buscadas precisam aparecer (em qualquer ordem).
  const haystack = normalizeText(`${customer.name} ${customer.email ?? ""}`);
  if (text.split(" ").every((word) => haystack.includes(word))) return true;

  // Telefone: compara só os dígitos (o E.164 inclui o 55 do país).
  const digits = digitsOnly(query);
  if (digits.length >= MIN_PHONE_DIGITS && customer.phoneE164) {
    if (digitsOnly(customer.phoneE164).includes(digits)) return true;
  }

  // Placa: compara sem traço e sem diferenciar maiúsculas.
  const plate = normalizePlate(query);
  if (plate.length >= 3 && customer.plates?.some((p) => normalizePlate(p).includes(plate))) {
    return true;
  }
  return false;
}
