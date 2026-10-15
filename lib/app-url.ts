// URL do próprio sistema a partir de fontes confiáveis (D38): o domínio de produção informado pela
// Vercel ou localhost — nunca o cabeçalho Host da requisição, que pode ser forjado (SSRF).

/** Base para o servidor chamar a si mesmo; null em deploys de preview (protegidos pela Vercel). */
export function trustedAppUrl(): string | null {
  if (process.env.VERCEL_ENV === "production" && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (!process.env.VERCEL) return `http://localhost:${process.env.PORT ?? 3000}`;
  return null;
}

/** Base para LINKS em mensagens (ex.: resumo diário): o domínio de produção serve em qualquer deploy. */
export function publicAppUrl(): string {
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  return trustedAppUrl() ?? "";
}
