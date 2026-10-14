"use server";

import { redirect } from "next/navigation";
import { startSession } from "@/lib/auth/session";
import { passwordMatches } from "@/lib/auth/token";
import { safeNextPath } from "@/lib/auth/redirect";

export type LoginState = { error?: string };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const password = String(formData.get("password") ?? "");
  const ok = await passwordMatches(
    password,
    process.env.GESTOR_PASSWORD ?? "",
    process.env.SESSION_SECRET ?? "",
  );
  if (!ok) {
    // Atraso fixo: torna tentativa e erro em massa bem mais lenta.
    await new Promise((resolve) => setTimeout(resolve, 600));
    return { error: "Senha incorreta. Tente de novo." };
  }
  await startSession();
  redirect(safeNextPath(formData.get("next")));
}
