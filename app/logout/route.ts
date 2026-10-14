import { endSession } from "@/lib/auth/session";

// POST (não GET): um link ou imagem em outro site não consegue deslogar o gestor.
export async function POST(request: Request) {
  await endSession();
  return Response.redirect(new URL("/login", request.url), 303);
}
