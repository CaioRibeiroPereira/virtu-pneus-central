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

test("Serviço feito pelo Vito → Revisão com a baixa sugerida → aprovar → estoque desce (D59)", async ({
  page,
}) => {
  // Estoque antes: Goodyear 185/60 R15 (o seed tem 8).
  await page.goto("/estoque");
  const goodyear = page
    .getByRole("listitem")
    .filter({ hasText: "Goodyear EfficientGrip 185/60 R15" });
  await expect(goodyear).toContainText("8 em estoque");

  await page.goto("/simulador");
  await page.getByRole("button", { name: /Loja avisa que o serviço foi feito/ }).click();
  await page.getByRole("button", { name: /Processar com o Vito/ }).click();
  const respostas = page.getByRole("list", { name: "Respostas do sistema" });
  await expect(respostas.getByText("Enviado para a sua revisão", { exact: true })).toBeVisible({
    timeout: 30_000,
  });

  // Revisão: a sugestão já vem preenchida; o gestor confere e aprova.
  await page.goto("/revisao");
  const card = page
    .getByRole("listitem")
    .filter({ hasText: "Registrar serviço feito" })
    .filter({ hasText: "Fernanda Costa" })
    .first();
  await expect(card.getByText(/Sugestão pela conversa: 4 × Goodyear EfficientGrip/)).toBeVisible();
  await expect(card.getByLabel("Produto 1")).toHaveValue(/[0-9a-f-]{36}/);
  await expect(card.getByLabel("Qtd.").first()).toHaveValue("4");
  await card.getByRole("button", { name: "Aprovar", exact: true }).click();
  await expect(page.getByText("Sugestão aprovada e aplicada.")).toBeVisible({ timeout: 30_000 });

  // Estoque depois: 8 − 4 = 4, com a saída ligada à Fernanda no histórico.
  await page.goto("/estoque");
  await expect(goodyear).toContainText("4 em estoque");
  await goodyear.getByRole("link").click();
  await expect(page.getByText(/Saída \(serviço\) -4/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Fernanda Costa" })).toBeVisible();
});
