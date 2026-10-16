import { expect, type Page } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";

export async function login(page: Page) {
  const password = process.env.GESTOR_PASSWORD;
  if (!password) throw new Error("GESTOR_PASSWORD não definida (.env.local)");
  await page.goto("/login");
  await page.getByLabel("Senha do gestor").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  // O primeiro Painel depois do login sincroniza as regras no banco: com o Neon lento, passa de 5 s.
  await expect(page).toHaveURL(/\/painel$/, { timeout: 15_000 });
}

/** Varredura axe com as regras WCAG 2.0/2.1/2.2 nível A e AA. */
export async function axeViolations(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  return result.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.slice(0, 3).map((n) => n.target.join(" ")),
  }));
}
