// Sessão do gestor sem banco de dados: um token assinado com HMAC-SHA256 guardado em cookie.
// Formato: "v1.<expiraEmMs>.<assinatura base64url>". Quem não tem o SESSION_SECRET não
// consegue forjar nem estender a validade (mudar o número invalida a assinatura).
// Usa Web Crypto (crypto.subtle), disponível tanto no proxy quanto nas rotas.

export const SESSION_COOKIE = "virtu_session";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias (§9)

const encoder = new TextEncoder();

function toBase64Url(bytes: ArrayBuffer): string {
  return Buffer.from(bytes).toString("base64url");
}

async function hmac(secret: string, message: string): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", key, encoder.encode(message));
}

/** Compara dois textos sem vazar, pelo tempo de resposta, quantos caracteres coincidem. */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSessionToken(
  secret: string,
  now = Date.now(),
): Promise<{ token: string; expiresAt: Date }> {
  const exp = now + SESSION_TTL_MS;
  const signature = toBase64Url(await hmac(secret, `v1.${exp}`));
  return { token: `v1.${exp}.${signature}`, expiresAt: new Date(exp) };
}

export async function verifySessionToken(
  token: string | undefined,
  secret: string,
  now = Date.now(),
): Promise<boolean> {
  if (!token || !secret) return false;
  const [version, exp, signature] = token.split(".");
  if (version !== "v1" || !exp || !signature || !/^\d+$/.test(exp)) return false;
  if (Number(exp) <= now) return false;
  const expected = toBase64Url(await hmac(secret, `v1.${exp}`));
  return constantTimeEqual(signature, expected);
}

/**
 * Confere a senha comparando os HMACs das duas (mesmo tamanho sempre),
 * para o tempo de resposta não depender do conteúdo.
 */
export async function passwordMatches(
  input: string,
  expected: string,
  secret: string,
): Promise<boolean> {
  if (!expected || !secret) return false;
  const [a, b] = await Promise.all([hmac(secret, input), hmac(secret, expected)]);
  return constantTimeEqual(toBase64Url(a), toBase64Url(b));
}

/** Bearer token dos agentes (§8.3, passo 1). */
export function bearerMatches(authorization: string | null, expected: string | undefined): boolean {
  if (!expected || !authorization?.startsWith("Bearer ")) return false;
  return constantTimeEqual(authorization.slice("Bearer ".length).trim(), expected);
}
