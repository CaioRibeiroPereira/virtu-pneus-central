import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE, createSessionToken, verifySessionToken } from "./token";

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET não configurado.");
  return secret;
}

/** Há uma sessão válida do gestor nesta requisição? */
export async function hasSession(): Promise<boolean> {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value, sessionSecret());
}

/**
 * Proteção dentro de rotas e Server Actions. O proxy já barra quem não tem sessão, mas a
 * documentação do Next recomenda verificar de novo aqui: uma mudança no matcher do proxy
 * não pode deixar uma ação desprotegida.
 */
export async function requireSession(): Promise<void> {
  if (!(await hasSession())) throw new Error("Sessão inválida ou expirada.");
}

export async function startSession(): Promise<void> {
  const { token, expiresAt } = await createSessionToken(sessionSecret());
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true, // inacessível ao JavaScript da página (protege contra XSS)
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
