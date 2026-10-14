/** Destino seguro após o login: só caminhos internos (evita redirecionar para outro site). */
export function safeNextPath(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return "/";
  if (value.startsWith("/login")) return "/";
  try {
    const url = new URL(value, "http://interno");
    return url.origin === "http://interno" ? `${url.pathname}${url.search}` : "/";
  } catch {
    return "/";
  }
}
