// Fluxos de ponta a ponta (§13). Gravam dados: começam e terminam com "Reiniciar demonstração"
// para a demo ficar sempre limpa (D37).
import { expect, test, type Page } from "@playwright/test";
import { login } from "./helpers";

async function resetDemo(page: Page) {
  await page.goto("/simulador");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Reiniciar demonstração" }).click();
  await expect(page.getByText(/Demonstração reiniciada/)).toBeVisible({ timeout: 30_000 });
}

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  await login(page);
  await resetDemo(page);
});

test.afterAll(async ({ browser }) => {
  const page = await browser.newPage();
  await login(page);
  await resetDemo(page);
  await page.close();
});

test("Hoje → concluir uma ação → aparece na linha do tempo da ficha", async ({ page }) => {
  await page.goto("/hoje");
  const atrasados = page.getByRole("region", { name: /Atrasados/ });
  const card = atrasados.getByRole("listitem").first();
  const customerName = (await card.getByRole("heading", { level: 3 }).innerText()).trim();

  await card.getByRole("button", { name: /^Concluir/ }).click();
  await expect(page.getByText(new RegExp(`Concluído: .*\\(${customerName}\\)`))).toBeVisible();

  await page.goto("/clientes?q=" + encodeURIComponent(customerName));
  await page.getByRole("link", { name: customerName }).first().click();
  await page.getByRole("link", { name: "Ações concluídas" }).click();
  await expect(page.getByText(/Ação concluída:/).first()).toBeVisible();
});

test("Simulador → aplica, reenvio é ignorado, alto impacto vai para a revisão → aprovar → aparece na ficha", async ({
  page,
}) => {
  await page.goto("/simulador");

  // Conversa 1: cliente novo → 3 eventos aplicados automaticamente.
  await page.getByRole("button", { name: /Processar com o Vito/ }).click();
  const respostas = page.getByRole("list", { name: "Respostas do sistema" });
  await expect(respostas.getByText("Aplicado automaticamente")).toHaveCount(3, { timeout: 30_000 });

  // Mesmo envio de novo → idempotência.
  await page.getByRole("button", { name: /Enviar de novo/ }).click();
  await expect(respostas.getByText(/Já recebido antes/)).toHaveCount(3, { timeout: 30_000 });

  // Conversa 2: aprovação de orçamento → fila de revisão.
  await page.getByRole("button", { name: /Cliente aprova orçamento/ }).click();
  await page.getByRole("button", { name: /Processar com o Vito/ }).click();
  // Texto exato e dentro da lista de respostas: a introdução da página também cita "enviado para a sua revisão".
  await expect(respostas.getByText("Enviado para a sua revisão", { exact: true })).toBeVisible({
    timeout: 30_000,
  });

  // Revisão: aprovar a mudança de situação do orçamento do Ricardo.
  await page.goto("/revisao");
  await expect(page.getByRole("heading", { level: 1, name: "Revisão" })).toBeVisible();
  const card = page
    .getByRole("listitem")
    .filter({ hasText: "Mudar situação do orçamento" })
    .filter({ hasText: "Ricardo Alves" })
    .first();
  await card.getByRole("button", { name: "Aprovar", exact: true }).click();
  await expect(page.getByText("Sugestão aprovada e aplicada.")).toBeVisible({ timeout: 30_000 });

  // Ficha: orçamento aprovado e a decisão registrada na linha do tempo.
  await page.goto("/clientes?q=ricardo");
  await page.getByRole("link", { name: "Ricardo Alves" }).first().click();
  await expect(page.getByText("Orçamento aprovado").first()).toBeVisible();
  await expect(page.getByText(/Sugestão do Vito aprovada por você/).first()).toBeVisible();

  // O cliente novo da conversa 1 existe e está marcado como provisório.
  await page.goto("/clientes?q=mariana");
  await expect(page.getByText("Mariana Lopes").first()).toBeVisible();
  await expect(page.getByText(/Criado pelo Vito/).first()).toBeVisible();
});
