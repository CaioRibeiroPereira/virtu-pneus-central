import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/token";

// Primeira barreira: toda página e API exige a sessão do gestor, exceto o login e as
// integrações dos agentes (que usam o próprio token Bearer). As rotas e Server Actions
// conferem a sessão de novo (requireSession), como recomenda a documentação do Next.
// /api/telegram: o webhook confere o segredo do Telegram e as rotas do n8n o token Bearer.
const PUBLIC_PATHS = ["/login", "/api/agent-events", "/api/agenda/hoje", "/api/telegram"];

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (await verifySessionToken(token, process.env.SESSION_SECRET ?? "")) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const login = new URL("/login", request.url);
  if (pathname !== "/") login.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = {
  // Não passa pelo proxy: arquivos do build, imagens otimizadas e arquivos públicos.
  matcher: ["/((?!_next/static|_next/image|favicon.svg|robots.txt).*)"],
};
