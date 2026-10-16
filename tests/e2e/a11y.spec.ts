// Acessibilidade (§10/§13): axe sem violações WCAG A/AA nas telas principais, em 375 e 1280 px,
// nos temas claro e escuro (T10). Também salva screenshots em docs/screenshots/depois/
// (comparação antes × depois); os do tema escuro têm o prefixo "escuro-".
import { expect, test } from "@playwright/test";
import { axeViolations, login } from "./helpers";

const VIEWPORTS = [
  { name: "375", width: 375, height: 812 },
  { name: "1280", width: 1280, height: 800 },
];

// Sem escolha salva, o tema segue o aparelho: emular o esquema de cores basta.
const THEMES = [
  { name: "claro", colorScheme: "light", prefix: "" },
  { name: "escuro", colorScheme: "dark", prefix: "escuro-" },
] as const;

for (const theme of THEMES)
  for (const vp of VIEWPORTS) {
    test.describe(`tema ${theme.name}, telas em ${vp.name}px`, () => {
      test.use({
        viewport: { width: vp.width, height: vp.height },
        colorScheme: theme.colorScheme,
      });

      test("login", async ({ page }) => {
        await page.goto("/login");
        await page.screenshot({
          path: `docs/screenshots/depois/${theme.prefix}${vp.name}-00-login.png`,
          fullPage: true,
        });
        expect(await axeViolations(page)).toEqual([]);
      });

      test("telas do gestor", async ({ page }) => {
        await login(page);
        const pages: [string, string][] = [
          ["/hoje", "01-hoje"],
          ["/clientes", "02-clientes"],
          ["/clientes/novo", "04-novo-cliente"],
          ["/mais", "06-mais"],
          ["/revisao", "07-revisao"],
          ["/simulador", "08-simulador"],
          ["/conversas", "09-conversas"],
        ];
        for (const [path, shot] of pages) {
          await page.goto(path);
          await page.screenshot({
            path: `docs/screenshots/depois/${theme.prefix}${vp.name}-${shot}.png`,
            fullPage: true,
          });
          expect(await axeViolations(page), path).toEqual([]);
        }

        // Ficha de um cliente com histórico (o primeiro da lista com "Ricardo").
        await page.goto("/clientes?q=ricardo");
        await page.getByRole("link", { name: "Ricardo Alves" }).first().click();
        await expect(page.getByRole("heading", { level: 1, name: "Ricardo Alves" })).toBeVisible();
        await page.screenshot({
          path: `docs/screenshots/depois/${theme.prefix}${vp.name}-03-ficha.png`,
          fullPage: true,
        });
        expect(await axeViolations(page), "ficha").toEqual([]);

        await page.getByRole("link", { name: "Editar" }).click();
        await page.screenshot({
          path: `docs/screenshots/depois/${theme.prefix}${vp.name}-05-editar.png`,
          fullPage: true,
        });
        expect(await axeViolations(page), "editar").toEqual([]);
      });
    });
  }

test("sem rolagem horizontal em 320 px (reflow, WCAG 1.4.10)", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await login(page);
  for (const path of ["/hoje", "/clientes"]) {
    await page.goto(path);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow, path).toBe(false);
  }
});

test("tema: o botão troca claro/escuro e a escolha fica salva", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page);
  const html = page.locator("html");
  const initial = await html.getAttribute("data-theme");
  const toggle = page.getByRole("button", { name: /^Modo (claro|escuro)$/ });
  await toggle.click();
  const changed = initial === "dark" ? "light" : "dark";
  await expect(html).toHaveAttribute("data-theme", changed);
  await page.reload();
  await expect(html).toHaveAttribute("data-theme", changed);
});
