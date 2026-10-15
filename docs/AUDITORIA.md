# Auditoria de execução

Registro cronológico do que foi feito no projeto: **o quê**, **como** (comandos exatos) e **resultado**. Atualizado ao fim de cada etapa.

Convenções:
- Comandos rodados no Git Bash (Windows 11, Node 22.14.0), na pasta do projeto, salvo indicação.
- "Resultado" é o que de fato aconteceu na execução, não o esperado.
- Commits sem coautoria de ferramentas de IA (decisão do autor).

---

## Etapa 0 — Diagnóstico do protótipo (13/10/2026)

**Objetivo:** entender o ponto de partida antes de planejar. Resultado completo em `docs/DIAGNOSTICO.md` e `docs/diagnostico-screenshots/`.

**Foi feito assim:**

1. Clone só da pasta do sistema no repositório da Virtù (feito pelo Caio, sparse checkout):
   ```bash
   git clone --filter=blob:none --sparse https://github.com/virtuvito/projetos.git
   cd projetos
   git sparse-checkout set sistema_atendimento_pneus
   ```
2. Instalação e execução do protótipo original (pnpm via corepack):
   ```bash
   corepack pnpm install --frozen-lockfile          # 627 pacotes, ~70 s
   corepack pnpm dev                                 # API 503: tabela inexistente
   corepack pnpm build                               # ok, 19 s
   node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js \
     d1 execute DB --local --config dist/server/wrangler.json \
     --persist-to .wrangler/state --file drizzle/0000_slim_scarlet_spider.sql
   corepack pnpm start                               # preview em 127.0.0.1:8787
   ```
3. Testes da API com `curl` (só no ambiente local): leitura, gravação, conflito de versão, payload inválido, origem diferente, corpo grande, XSS.
4. Testes de interface e acessibilidade (ferramentas instaladas em pasta temporária, fora do projeto): Playwright 1.64 (screenshots em 375/768/1440 px e testes funcionais), axe-core 4.13 (18 varreduras), Lighthouse 13.5 (local e demo pública).
5. Qualidade e segurança:
   ```bash
   corepack pnpm lint                                # 16 problemas (13 erros)
   ./node_modules/.bin/tsc --noEmit --incremental false   # 0 erros
   corepack pnpm audit --json                        # 62 vulnerabilidades (1 crítica)
   ```

**Resultado:** 15 seções de diagnóstico, 10 bugs reproduzidos, notas de acessibilidade, avaliação do plano. Nenhum arquivo versionado da Virtù foi alterado.

---

## Etapa 1 — Repositório próprio (14/10/2026)

**Objetivo:** item 1 da Fase 0 — repositório privado com o snapshot original intacto (decisão D1).

**Histórico:** uma primeira versão do repositório foi descartada (o primeiro commit saiu com uma linha de coautoria de IA, que o autor não queria). O repositório foi apagado no GitHub e recriado vazio com o mesmo nome; as pastas locais foram apagadas depois de um backup dos documentos.

**Foi feito assim:**

1. Cópia dos arquivos versionados da pasta original, sem `node_modules`, build ou banco local:
   ```bash
   git archive HEAD:sistema_atendimento_pneus | tar -x -C ../virtu-pneus-central
   ```
2. Repositório e commits:
   ```bash
   git init -b main
   git add -A
   git commit -m "chore: snapshot original (virtuvito/projetos@1609d51)"
   # + docs/DIAGNOSTICO.md e o plano
   git commit -m "docs: adiciona diagnóstico e plano de desenvolvimento"
   git remote add origin https://github.com/CaioRibeiroPereira/virtu-pneus-central.git
   git push -u origin main
   # + screenshots do diagnóstico
   git commit -m "docs: adiciona screenshots do diagnóstico (antes)"
   git push
   ```

**Resultado:**

| Commit | Conteúdo |
|---|---|
| `4e50324` | 112 arquivos originais, sem alteração |
| `2c70e4e` | diagnóstico + plano |
| `4851401` | 34 screenshots (2,7 MB) |

Verificação: `git ls-remote origin` → `main` em `4851401`; nenhum commit com coautoria (`git log --format=%B | grep -ci co-authored` → 0).

---

## Etapa 2 — Fase 0: migração para Next.js + Neon (14/10/2026)

**Objetivo:** itens 2 e 3 da Fase 0 (`docs/PLANO_DESENVOLVIMENTO.md` §16).

### 2.1 Pré-requisitos (feitos pelo Caio)
- Projeto criado no Neon (Postgres, região `sa-east-1`, connection string *pooled*).
- Vercel CLI instalada e login feito:
  ```bash
  npm i -g vercel        # Vercel CLI 64.0.2
  vercel login
  ```

### 2.2 Decisão do gerenciador de pacotes
npm em vez de pnpm (D14 em `DECISOES.md`).

### 2.3 Remoção da plataforma ChatGPT Sites / Cloudflare
**Foi feito assim:**
```bash
git rm -r vite.config.ts build .openai scripts examples app/chatgpt-auth.ts \
  cloudflare-env.d.ts pnpm-lock.yaml pnpm-workspace.yaml .npmrc drizzle \
  lib/database.ts public/file.svg public/globe.svg public/window.svg
```
Também removidos em `app/`: a ferramenta WebMCP (`useEffect` com `document.modelContext`) em `page.tsx` e a meta `codex-preview` em `layout.tsx`.

### 2.4 Novo `package.json` e instalação
Versões escolhidas (D15): `next` 16.4.0, `react` 19.2.9, `drizzle-orm` 0.45.4, `drizzle-kit` 0.31.11, `@neondatabase/serverless` 1.2.0, `tailwindcss` 4.3.3, `typescript` 5.9.3, `eslint` 9.39.5, `zod` 3.25.76, `vitest` 5.0.4, `prettier` 3.9.10.

```bash
npm view next@16 version          # conferir versões disponíveis (16.3.8, 16.4.0)
npm install
```
Resultado: 487 pacotes em 150 s. Avisos: pacotes `@esbuild-kit/*` obsoletos (dependência do drizzle-kit) e ESLint 9 fora de suporte (registrado em D15).

Incidente: a primeira tentativa de consultar o npm falhou com `ENOSPC` (disco C: cheio). Resolvido com limpeza de caches fora do projeto antes de continuar.

### 2.5 Banco: D1 (SQLite) → Neon (Postgres)
Arquivos reescritos:
- `db/schema.ts` — tabela `customers` em Postgres (`id text`, `data jsonb`, `revision integer`), mantendo o formato do protótipo até a Fase 1 (D17).
- `db/index.ts` — conexão com `drizzle-orm/neon-http`, criada sob demanda a partir de `DATABASE_URL` (D16).
- `drizzle.config.ts` — dialeto `postgresql`; lê `.env.local` com `process.loadEnvFile`.
- `app/api/crm/route.ts` — mesma regra do original (seed, trava otimista por `revision`, checagem de `Origin`, limite de 200 KB), agora com Drizzle.

### 2.6 Componentes de UI sem uso
`tsc` acusou erros nos componentes que dependiam dos pacotes removidos. Mantidos só os 11 usados.
```bash
npx tsc --noEmit        # erros em calendar, chart, carousel, form... (pacotes removidos)
cd components/ui
keep=" sidebar dialog select tabs table button input separator sheet skeleton tooltip "
for f in *.tsx; do b="${f%.tsx}"; case "$keep" in *" $b "*) ;; *) git rm -q "$f";; esac; done
cd ../..
npx tsc --noEmit        # 0 erros
```
Resultado: 50 componentes removidos.

### 2.7 Build e commit da migração
```bash
npx next build          # Next.js 16.4.0 (Turbopack), ok em 35 s
git add -A
git commit -m "build: migra de vinext/Cloudflare D1 para Next.js 16 + Neon com npm"
```
Commit `cb7ec2b`.

### 2.8 Prettier e fim de linha
Criados `.prettierrc.json` (largura 100, fim de linha LF), `.prettierignore` (não formata `*.md`, `vendor`, `drizzle`), `.gitattributes` (`* text=auto eol=lf`) e `eslint-config-prettier` no `eslint.config.mjs`.
```bash
npx prettier --write .
git add --renormalize .
npx tsc --noEmit
git commit -m "style: configura Prettier e formata o código (sem mudança de lógica)"
```
Resultado: `app/page.tsx` passou de 43 linhas longas para ~1.450 linhas legíveis. Commit `35ad187`.

### 2.9 Correção do lint herdado
```bash
npx eslint .            # 12 problemas (10 erros, 2 avisos), todos em app/page.tsx
```
Correções (sem mudar comportamento): tipo `ApiResult` para as respostas da API; `catch (e)` com `errorMessage(e)`; campo `id?` no tipo do formulário (remove os `as any` do "Remarcar"); props tipadas no `Metric`; `let` → `const`; imports sem uso removidos; carga inicial sem `setState` síncrono no `useEffect` (`requestClients().then(applyClients)`).
```bash
npx prettier --write app/page.tsx
npx tsc --noEmit        # ok
npx eslint .            # 0 problemas
git commit -m "fix: corrige os erros de lint herdados do protótipo"
```
Commit `0a533af`.

### 2.10 Página de saúde, migration, variáveis e testes
- `app/saude/page.tsx` — consulta o banco a cada acesso (`force-dynamic`): status, tempo da consulta, hora do servidor e existência da tabela; em erro, mostra mensagem genérica e registra o detalhe só no log.
- `.env.example` — variáveis do plano (§5); `.gitignore` ignora `.env*` exceto `.env.example`.
- `vitest.config.ts` — testes em `tests/**/*.test.ts` (os primeiros na Fase 1).

```bash
npx tsc --noEmit && npx eslint . && npm test && npx next build   # tudo ok; rota /saude dinâmica
npm run db:generate     # drizzle/0000_secret_meteorite.sql: CREATE TABLE "customers" (...)
git commit -m "feat: página /saude, migration Postgres, .env.example e Vitest"
```
Commit `1741365`.

### 2.11 Registro de decisões
`DECISOES.md` com D1–D13 (do plano) e D14–D19 (desta fase). Commit `a292058`.

### 2.12 Verificações ao fim da etapa

| Verificação | Comando | Resultado |
|---|---|---|
| Tipos | `npm run typecheck` | 0 erros |
| Lint | `npm run lint` | 0 problemas (antes: 16) |
| Testes | `npm test` | sem arquivos de teste ainda (passa) |
| Build | `npm run build` | ok |
| Vulnerabilidades em produção | `npm audit --omit=dev` | 0 (antes: 62 no total, 1 crítica) |
| Coautoria nos commits | `git log --format=%B \| grep -ci co-authored` | 0 |

### 2.13 Organização da documentação
Plano movido para `docs/PLANO_DESENVOLVIMENTO.md` (referências atualizadas em `DECISOES.md`, `db/schema.ts` e `app/api/crm/route.ts`) e criado este arquivo.
```bash
git mv PLANO_DESENVOLVIMENTO.md docs/PLANO_DESENVOLVIMENTO.md
```

---

### 2.14 Banco no Neon e teste local
**Foi feito assim:**
1. `.env.local` criado a partir do `.env.example` com a `DATABASE_URL` do Neon. Confirmado que o git ignora o arquivo:
   ```bash
   cp .env.example .env.local        # e preenchida a DATABASE_URL
   git check-ignore -v .env.local    # .gitignore:16:.env*
   ```
2. Migration aplicada no Neon:
   ```bash
   npm run db:migrate                # migrations applied successfully
   ```
3. Teste com o build de produção local:
   ```bash
   npm run build && npx next start -p 3000
   curl http://localhost:3000/saude          # conectado, consulta em ~50 ms, 0 registros
   curl http://localhost:3000/api/crm        # 200, 16 clientes criados no Neon
   curl http://localhost:3000/               # 200
   ```
4. Gravação pela API (`POST /api/crm`): atualização válida → 200 (revisão 1 → 2); versão antiga → 409 (trava otimista); cliente novo → 200.
5. Limpeza dos dados de teste (`truncate table customers`) para o deploy começar só com os clientes de exemplo.

**Resultado:** a aplicação funciona de ponta a ponta com o Postgres do Neon.

### 2.15 Deploy na Vercel
**Foi feito assim:**
1. O `vercel link` interativo travou no Git Bash (menus com setas); usado o modo sem perguntas:
   ```bash
   vercel project ls                                   # nenhum projeto na conta
   vercel link --yes --project virtu-pneus-central     # cria e vincula o projeto
   ```
   Efeitos colaterais do comando, conferidos e tratados:
   - conectou o repositório do GitHub ao projeto (deploy automático a cada push — ver D20);
   - acrescentou `VERCEL_OIDC_TOKEN` ao `.env.local` (a `DATABASE_URL` continuou intacta);
   - acrescentou linhas repetidas ao `.gitignore`, que anulavam a exceção do `.env.example` — revertido com `git checkout -- .gitignore`.
2. Variável de ambiente cadastrada como segredo, lida do `.env.local` sem aparecer na tela:
   ```bash
   V=$(grep "^DATABASE_URL=" .env.local | cut -d= -f2-)
   printf "%s" "$V" | vercel env add DATABASE_URL production
   printf "%s" "$V" | vercel env add DATABASE_URL preview
   vercel env ls                                       # DATABASE_URL: Secret, Production e Preview
   ```
3. Deploy e validação:
   ```bash
   vercel ls                                           # nenhum deploy anterior
   vercel deploy --prod --yes
   curl https://virtu-pneus-central.vercel.app/        # 200
   curl https://virtu-pneus-central.vercel.app/saude   # 200, conectado, ~250 ms
   curl https://virtu-pneus-central.vercel.app/api/crm # 200, 16 clientes
   ```

**Resultado:** sistema no ar em **https://virtu-pneus-central.vercel.app**, conectado ao Neon.

---

## Pendências da Fase 0 (item 4)

- [x] `.env.local` com a `DATABASE_URL` do Neon.
- [x] `npm run db:migrate` e teste local de `/saude`, da API e da tela.
- [x] `git push` dos commits da Etapa 2.
- [x] Deploy na Vercel e validação de `/saude` na URL pública.

**Fase 0 concluída.**

Observação: a `/api/crm` herdada continua pública e sem autenticação na URL publicada, com dados fictícios. A proteção chega na Fase 2 (§3, item 1 do plano).

---

## Etapa 3 — Fase 1: dados (14/10/2026)

**Objetivo:** modelo normalizado, migrations, seed relativo a hoje e as bibliotecas `lib/dates`, `lib/phone`, `lib/search` com testes (§6, §7.3 e §13 do plano). Decisões D21–D26.

### 3.1 Bibliotecas de apoio
**Foi feito assim:**
```bash
npm install libphonenumber-js@^1          # 1.13.15
# teste rápido: a versão padrão ("min") aceitou "(19) 00000-1000" e "3232-1000" (sem DDD);
# a versão "/max" recusou os dois → adotada (D24)
```
- `lib/dates.ts`: `todayInStore` (dia da loja em America/Sao_Paulo), `addDays`/`diffInDays` (aritmética de calendário imune a fuso), `storeTimeToUtc` (hora da loja → UTC), formatação e `describeDue` ("atrasado há 3 dias").
- `lib/phone.ts`: `normalizePhone` (qualquer formato → E.164 + exibição) e `whatsappLink`.
- `lib/search.ts`: `matchesSearch` (sem acento, por dígitos do telefone, por placa sem traço).
- Testes em `tests/unit/` (dates, phone, search).
```bash
npm test        # 44 testes passando
npx tsc --noEmit && npx eslint .
git commit -m "feat(lib): datas no fuso da loja, telefone E.164 e busca normalizada"
```
Commit `994dc0b`.

### 3.2 Modelo de dados e migrations
`db/schema.ts` reescrito com 11 tabelas e 13 enums do §6, mais `legacy_customers` (D21). A `/api/crm` herdada passou a usar `legacy_customers`; a `/saude` passou a contar registros por tabela.

Migração em duas etapas (D23):
```bash
# etapa 1: schema vazio temporário → só remove a tabela antiga
printf 'export {};\n' > db/_vazio.ts
npx drizzle-kit generate --dialect postgresql --schema ./db/_vazio.ts --out ./drizzle --name remove_tabela_prototipo
rm db/_vazio.ts                 # drizzle/0001_remove_tabela_prototipo.sql: DROP TABLE "customers"
# etapa 2: schema completo → só cria
npx drizzle-kit generate --name modelo_normalizado   # 0002: 11 tabelas, 13 enums, CHECK, índice único parcial
git commit -m "feat(db): modelo normalizado do §6 e tabela herdada renomeada"
```
Commit `6861fc5`.

### 3.3 Seed relativo a hoje
- `db/seed-data.ts`: `buildSeed(hoje)`, função pura que monta 15 clientes cobrindo R1–R4, tarefas atrasadas/hoje/próximas, um cliente provisório criado pelo agente e 3 itens na fila de revisão (alto impacto, baixa confiança, conflito com edição humana).
- `db/reset.ts`: `resetDemoData` apaga e recria tudo num único `batch` (transação); será reaproveitado pelo botão "Reiniciar demonstração".
- `db/seed.ts`: script do `npm run db:seed`.
- `tests/unit/seed-data.test.ts`: 11 testes (referências entre tabelas, telefones válidos e únicos, cobertura de cada regra).

Um teste falhou na primeira execução por erro do próprio teste (`.sort()` ordena números como texto); corrigido para `.sort((a, b) => a - b)`.
```bash
npm test        # 55 testes passando
git commit -m "feat(db): seed fictício relativo a hoje e script db:seed"
```
Commit `fd03107`.

### 3.4 Aplicação no Neon e verificação
```bash
npm run db:migrate      # migrations applied successfully
npm run db:seed         # dia 2026-10-14: 15 clientes, 13 veículos, 4 orçamentos, 5 serviços,
                        # 3 agendamentos, 7 atendimentos, 5 tarefas, 6 eventos, 3 itens de revisão
```
Verificação direta no banco:
- inserir cliente "perdido" sem motivo → recusado (`customers_loss_reason_when_lost`);
- inserir tarefa automática R2 duplicada → recusada (`tasks_auto_rule_unique`).

Efeito colateral conhecido: entre a migração e o deploy seguinte, a versão publicada (que ainda usava o nome antigo da tabela) ficou fora do ar por alguns minutos.

### 3.5 Verificações ao fim da etapa

| Verificação | Comando | Resultado |
|---|---|---|
| Tipos | `npm run typecheck` | 0 erros |
| Lint | `npm run lint` | 0 problemas |
| Testes | `npm test` | 55 passando (4 arquivos) |
| Restrições no banco | inserções inválidas no Neon | recusadas |

---

## Etapa 4 — Fase 2: núcleo (14/10/2026)

**Objetivo:** login do gestor, `POST /api/agent-events` completo, regras R1–R4, montagem do "Hoje", auditoria e testes de integração (§7, §8, §11 e §13 do plano). Decisões D27–D33.

### 4.1 Dependências
```bash
npm install zod@^4.6.7 ws@^8 server-only
npm install -D @electric-sql/pglite @types/ws
npx tsc --noEmit && npm test       # código existente compatível com o zod 4
```
Consulta à documentação que vem com o Next 16 (`node_modules/next/dist/docs`): o `middleware.ts` virou `proxy.ts`, roda em Node e não deve ser a única proteção.

### 4.2 Autenticação e segurança
- `lib/auth/token.ts`: sessão assinada (HMAC-SHA256), senha e Bearer comparados em tempo constante.
- `lib/auth/session.ts`: cookie `httpOnly`, `sameSite=lax`, `secure` em produção, 7 dias.
- `proxy.ts`: exige sessão em tudo, exceto `/login`, `/api/agent-events` e `/api/agenda/hoje`.
- `app/(auth)/login`: formulário com rótulo visível e erro anunciado (`role="alert"`); `app/logout` por POST.
- `/api/crm` e `/saude` conferem a sessão de novo; `next.config.ts` com CSP básica, `nosniff`, `Referrer-Policy`, `X-Frame-Options: DENY`, sem `X-Powered-By`.
- Segredos gerados aleatoriamente no `.env.local` (senha da demo, `SESSION_SECRET`, `AGENT_API_TOKEN`), sem exibir valores.

Verificação local (`npx next start`): sem login, `/` e `/saude` → 307 para `/login`; `/api/crm` → 401; cookie forjado → 401; cabeçalhos presentes. Commit `b24a76c`.

### 4.3 Regras e painel Hoje
- `lib/rules/auto-tasks.ts`: `computeAutoTasks` (puro) e `syncAutoTasks` (cria o que falta, cancela R1/R4 obsoletos, audita).
- `lib/rules/today.ts`: `assembleToday` (puro) e `loadTodayPanel`.
- `db/reset.ts` passou a usar transação e a gerar as tarefas automáticas depois do seed.
Commit `9c8480f`.

### 4.4 Endpoint dos agentes
- `lib/agent/schema.ts` (contrato zod), `apply.ts` (aplicação por tipo, reutilizável na aprovação), `process.ts` (pipeline em transação), `handler.ts` (camada HTTP testável sem o Next).
- `app/api/agent-events/route.ts` e `app/api/agenda/hoje/route.ts`.
Commits `eed844b` e `9582b38` (registro dos campos ignorados).

### 4.5 Edição pelo gestor
`lib/customers/update.ts`: trava otimista, `human_edited_fields`, confirmação do provisório, telefone único, "perdido" exige motivo, auditoria. Commit `5439242`.

### 4.6 Testes
```bash
npm test        # 121 testes em 9 arquivos
```
- Unidade: contrato zod (8 tipos válidos e casos inválidos), regras puras (R1 usa o dia da loja; R3 em 180 dias; R4 na véspera), `assembleToday`, autenticação.
- Integração com PGlite (Postgres em memória, mesmas migrations): 401/415/413/422, idempotência, matching em outro formato de telefone, cliente provisório, cliente não encontrado, baixa confiança, alto impacto (orçamento não muda sem o gestor), conflito com edição humana, auditoria, tarefa R1 gerada, painel Hoje sobre o seed, idempotência das regras, cancelamento de R1/R4, trava otimista (409).

Três falhas durante a escrita, todas dos próprios testes: orçamento "mais recente" mudou com um teste anterior; espaço não separável na formatação de moeda; regex corrompida por `sed`. Corrigidas.

### 4.7 Verificação contra o Neon real
```bash
npm run db:seed                 # via WebSocket: 15 clientes, 12 tarefas automáticas criadas
npx next start -p 3000
curl -X POST .../api/agent-events                         # sem token → 401
curl -X POST -H "Authorization: Bearer $TOKEN" ...        # → 201 applied (orçamento)
# mesmo corpo de novo                                     # → 200 duplicate
curl -H "Authorization: Bearer $TOKEN" .../api/agenda/hoje  # 3 revisões, 4 atrasados, 6 hoje, 5 próximos
```
Login simulado como formulário sem JavaScript: senha errada → sem cookie; senha certa → 303 + cookie; `/saude` e `/api/crm` com a sessão → 200. Seed refeito depois dos testes para limpar os dados.

### 4.8 Variáveis na Vercel (antes do push, para o site não ficar trancado)
```bash
for k in GESTOR_PASSWORD SESSION_SECRET AGENT_API_TOKEN APP_TIMEZONE AGENT_AUTO_APPLY_THRESHOLD; do
  V=$(grep "^$k=" .env.local | cut -d= -f2-)
  printf "%s" "$V" | vercel env add $k production
  printf "%s" "$V" | vercel env add $k preview
done
```

---

## Etapa 5 — Fase 3: telas principais (14/10/2026)

**Objetivo:** Login, Hoje, Clientes, Novo/editar e Ficha (§9) com as diretrizes visuais e de acessibilidade do §10. Decisões D34–D37.

### 5.1 Remoção do legado
```bash
git rm -r app/api/crm lib/crm.ts lib/validation.ts components hooks vendor components.json lib/utils.ts app/page.tsx
npx drizzle-kit generate --name remove_tabela_legado   # 0003: DROP TABLE "legacy_customers"
npm uninstall radix-ui class-variance-authority clsx tailwind-merge tw-animate-css
npm run db:migrate
```
Commit `1f6b7eb`.

### 5.2 Telas
- `app/globals.css`: tokens do §10, base 16 px, alvos de 44 px, foco visível, layout mobile-first (barra inferior < 900 px; lateral ≥ 900 px).
- `app/(app)/layout.tsx`: exige sessão, contador de revisões pendentes, link "pular para o conteúdo", toasts.
- `app/(app)/hoje`, `clientes`, `clientes/novo`, `clientes/[id]`, `clientes/[id]/editar`, `mais`; `revisao` e `simulador` provisórias (Fase 4).
- `lib/customers/`: `input.ts` (zod dos formulários), `commands.ts` (ações em transação com auditoria e regras), `queries.ts`, `timeline.ts` (linha do tempo unificada, função pura); `lib/messages.ts` (mensagens de WhatsApp por tipo).
- `app/(app)/actions.ts`: Server Actions (conferem a sessão de novo).
Commit `b6d8501`.

### 5.3 Acessibilidade e screenshots
```bash
npm install -D @playwright/test @axe-core/playwright   # sem baixar navegadores: usa o Chrome instalado
npm run build && npx playwright test
```
Resultado: **0 violações** do axe (WCAG 2.0/2.1/2.2 A e AA) em login, Hoje, Clientes, ficha, novo e editar, em 375 e 1280 px; sem rolagem horizontal em 320 px. Screenshots em `docs/screenshots/depois/`.

Revisão visual dos screenshots encontrou 5 problemas que o axe não pega, todos corrigidos:
1. data "Quarta-Feira, 14 De Outubro" (CSS capitalizava todas as palavras);
2. concordância no texto da R4 ("Troca de pneus marcado");
3. filtro ativo do histórico sem destaque visual;
4. seções "Registrar" sem indicação de que abrem;
5. ação que vence hoje em vermelho (vermelho fica só para atraso).

Incidente: duas cópias do `playwright-core` (1.64.0 e 1.64.1) quebravam os tipos; resolvido com `@playwright/test@1.64.1`, `overrides` no `package.json` e limpeza do cache incremental do TypeScript (`tsconfig.tsbuildinfo`). Commit `bd37400`.

### 5.4 Verificações ao fim da etapa

| Verificação | Comando | Resultado |
|---|---|---|
| Tipos | `npm run typecheck` | 0 erros |
| Lint | `npm run lint` | 0 problemas |
| Unidade + integração | `npm test` | 121 passando |
| Acessibilidade (E2E) | `npm run test:e2e` | 5 passando, 0 violações |

---

## Etapa 6 — Fase 4: revisão e simulador (15/10/2026)

**Objetivo:** fila de revisão e simulador (§9) com as conversas do §12.3; testes E2E e de acessibilidade do §13. Decisões D38–D41.

### 6.1 Fila de revisão
- `lib/review/commands.ts`: `approveReview` (aprovar, editar e aprovar, associar/criar cliente) e `rejectReview`, em transação, com auditoria e regras.
- `lib/review/queries.ts`: pendentes com "hoje no sistema × proposta do Vito"; decididas recentemente; lista de clientes para associar.
- `app/(app)/revisao` + `components/review-card.tsx`.
- Ficha: decisões de revisão entram na linha do tempo.

Incidente: as sugestões criadas pelo seed não podiam ser aprovadas (`needs_customer`), porque o seed gravava a proposta num formato diferente do pipeline. Corrigido nos dois lados: seed no mesmo formato e aprovação aceitando o cliente registrado no evento.

### 6.2 Simulador
- `simulator/presets/*.json`: 6 conversas (cliente novo com orçamento; aprovação de orçamento; agendamento no sábado; reclamação pós-troca; número desconhecido; reenvio).
- `lib/simulator/presets.ts`: envelope do §8.1, datas relativas, `event_id` estável.
- `app/(app)/simulador/actions.ts`: envio HTTP ao `/api/agent-events` pelo servidor, JSON livre e "Reiniciar demonstração".

Revisão de segurança durante a escrita: a primeira versão montava a URL do endpoint a partir do cabeçalho `Host`/`x-forwarded-host`; trocada por fontes confiáveis (D38).

### 6.3 Testes
```bash
npm test             # 136 passando (unidade + integração), incluindo a fila de revisão e os presets
npm run build && npx playwright test   # 7 passando
```
- `tests/integration/review.test.ts`: alto impacto aprovado (orçamento aprovado, R1 cancelado, decisão auditada); decidir duas vezes é recusado; conflito aprovado aceita o valor do agente; cliente desconhecido exige escolha; correção inválida recusada; criar cliente e aplicar com correção; rejeitar não altera nada.
- `tests/unit/presets.test.ts`: os 6 presets passam no contrato do §8; o reenvio usa os mesmos `event_id`; datas relativas.
- `tests/e2e/flows.spec.ts`: Hoje → concluir → linha do tempo; simulador → aplicado (3) → reenvio "duplicate" (3) → alto impacto → aprovar na revisão → orçamento aprovado e decisão na ficha. Cada teste reinicia a demonstração antes e depois.

Problemas encontrados pelos testes E2E (2 reais, 1 do próprio teste):
1. axe: links distinguíveis só pela cor (WCAG 1.4.1) → links sublinhados.
2. sem confirmação ao decidir uma sugestão → aviso dentro da ação (D41).
3. o teste esperava "Enviado para a sua revisão" com `getByText` simples, que ignora maiúsculas e aceita trecho, e casou com a introdução da página → verificação restrita à lista de respostas e com texto exato.

---

## Etapa 7 — Fase 5: IA real, n8n, documentação e entrega (15/10/2026)

**Objetivo:** camada de IA com dois provedores (D42), banco de testes, workflow do n8n, Lighthouse, README, `docs/AGENTES_IA.md` e `RESUMO_ENTREGA.md`. Decisões D42–D51.

### 7.1 Camada de IA
- `lib/agent/prompt.ts`: prompt `extracao-v2`, sem dependências.
- `lib/agent/extraction.ts`: JSON Schema gerado do contrato zod; `postProcess` com validação zod.
- `lib/agent/refine.ts`: núcleo sem zod (lastro, confiança, envelope); `postProcessLite` para o n8n.
- `lib/agent/llm.ts`: Gemini (novas tentativas, modelos reserva, falhas de rede) e Ollama (`format` = schema).

Incidentes:
- `gemini-2.5-flash` deu 404 para contas novas.
- `3.8-flash` e `flash-latest` deram 503.
- Houve `ECONNRESET`.
- A cota diária do `3.5-flash` acabou no fim do dia.

As soluções estão na D43.

### 7.2 Banco de testes
```bash
npx tsx --env-file=.env.local scripts/avaliar-extracao.ts --provedor ambos \
  --modelos-ollama qwen2.5:3b,llama3.2:3b,qwen2.5:7b --salvar   # → docs/AVALIACAO_IA.md
```
Evolução medida no Gemini: 69% (v1) → 93% → 97% → 100% (2 rodadas) → 97% na rodada final, respondida pelo modelo reserva. Locais: `llama3.2:3b` 62% com 0 indevidos (escolhido, D49); `qwen2.5:7b` 48% e inventou valores, o que levou ao lastro (D48).

### 7.3 Ollama e Docker (disco C: com menos de 1 GB)
```powershell
setx OLLAMA_MODELS "D:\ollama\models"
curl.exe -sSL -o D:\ollama\OllamaSetup.exe https://ollama.com/download/OllamaSetup.exe   # assinatura: Ollama Inc. (válida)
$env:TEMP='D:\ollama\tmp'; Start-Process D:\ollama\OllamaSetup.exe -ArgumentList '/VERYSILENT','/DIR=D:\ollama\app' -Wait
$env:OLLAMA_MODELS='D:\ollama\models'; D:\ollama\app\ollama.exe serve      # o servidor aberto pelo instalador ignorava a variável
ollama pull qwen2.5:3b; ollama pull llama3.2:3b; ollama pull qwen2.5:7b
```
- n8n pelo npm: falhou ao compilar `isolated-vm`, que exige o Visual Studio Build Tools.
- O Caio moveu o disco do Docker Desktop para `D:\Docker\DockerDesktopWSL`. Com isso o C: ficou com 22 GB livres.

### 7.4 n8n ponta a ponta
```bash
npx tsx scripts/gerar-workflow-n8n.ts                  # → infra/n8n/workflows/vito-extracao.json
docker compose -f infra/n8n/docker-compose.yml up -d   # n8n 2.43.6, porta só em 127.0.0.1
# import:credentials (arquivo temporário apagado do container e do disco), import:workflow, publish:workflow
curl -X POST localhost:5678/webhook/vito-conversa -H "content-type: application/json" -d @infra/n8n/exemplo-conversa.json
```
Problemas encontrados, em ordem:
1. `Extracao.buildPrompt is not a function` → o task runner do n8n troca `Object.defineProperty` por uma função vazia (encontrado no código do runner); o empacotamento passou a usar atribuição simples.
2. `util_exports.derived is not a function` → o zod também depende de `defineProperty`; o n8n passou a usar o núcleo sem zod (D50). Nó de 450 KB → 5 KB.
3. Dois eventos com 500: corrida ao criar o cliente provisório → `ON CONFLICT DO NOTHING` (D51). Verificado com 5 eventos simultâneos no Neon (todos 201, um único cliente) e com o teste `tests/integration/agent-race.test.ts`, que reproduz a corrida com um trigger: 500 no código antigo, 201 com a correção.
4. Gemini 429 (cota diária) → nó "Gemini (modelo reserva)" na saída de erro.

Resultado: Gemini (via reserva) com 4 eventos aplicados em 7,5 s; Ollama com 3 eventos em cerca de 13 s. Prints em `docs/screenshots/n8n/`.

### 7.5 Lighthouse 13.5 na produção
Login feito com o Playwright; o cookie de sessão foi passado por `--extra-headers` e guardado só na pasta temporária. Foram 6 telas × celular/computador.
- Acessibilidade 100 em todas (antes: 89–95).
- SEO 90 só por causa do link "Mais", mantido (ver o RESUMO).

### 7.6 Verificações ao fim da etapa
| O quê | Comando | Resultado |
|---|---|---|
| Formato / lint / tipos | `npm run format:check && npm run lint && npm run typecheck` | ok |
| Unidade + integração | `npm test` | 152 passando |
| E2E na produção | `E2E_BASE_URL=https://virtu-pneus-central.vercel.app npx playwright test` | 7 passando |
| Segredos | `git diff --cached` procurando a chave do Gemini, a senha do Neon e o token | nada encontrado (a senha da demo está no README de propósito, §17) |
| Demo limpa | `npm run db:seed` | dados de teste removidos; seed relativo a hoje |

---

## Etapa 8 — Melhorar o Ollama (15/10/2026)

**Objetivo:** aumentar a qualidade do modelo local sem "decorar" as conversas de teste. Decisões D52 e D53.

### 8.1 Conjunto de validação (antes de qualquer ajuste)
- `scripts/avaliacao/conversas-validacao.json`: 8 conversas novas, com gabarito validado pelo contrato em `tests/unit/evaluation.test.ts`.
- Novos marcadores de data: `$TODAY+N@HH:MM` e `$NEXT_DOW:N@HH:MM`.
- `scripts/avaliar-extracao.ts` passou a separar os resultados por conjunto (`--conjunto`) e por estratégia (`--modos`).

### 8.2 Estratégias testadas (todas com testes de unidade)
- `lib/agent/hints.ts`: placas, medidas, valores e horários achados por código.
- `lib/agent/focused.ts`: classificação + um pedido por tipo.
- `lib/agent/verify.ts`: verificação sim/não por evento.
- `lib/agent/strategies.ts`: escolhe a estratégia.
- `lib/agent/prompt.ts`: dividido em partes, com teste de que o prompt direto continua idêntico byte a byte.
- Modelos: `gemma3:4b` e `qwen3:4b` (com `think: false`).

```bash
npx tsx --env-file=.env.local scripts/avaliar-extracao.ts --provedor ollama --modelos-ollama llama3.2:3b \
  --modos direto,direto+dicas,focado,focado+dicas
npx tsx --env-file=.env.local scripts/avaliar-extracao.ts --provedor ollama --modelos-ollama llama3.2:3b \
  --modos direto+verif,direto+dicas+verif
npx tsx --env-file=.env.local scripts/avaliar-extracao.ts --provedor ollama --modelos-ollama gemma3:4b,qwen3:4b \
  --modos direto,direto+dicas
```

Resultado: nenhuma estratégia melhorou acerto e segurança juntos (tabela na D52). Cuidado registrado: um exemplo tirado de um erro do conjunto de validação foi escrito no prompt de verificação e retirado antes de medir.

### 8.3 Lastro por origem (D53)
- `refine.ts`: nome, e-mail e cidade só valem se vierem de mensagem do cliente; o valor do orçamento, só se vier da loja.
- Indevidos do `llama3.2:3b`: 1 → 0.

### 8.4 Avaliação oficial e n8n
```bash
npx tsx --env-file=.env.local scripts/avaliar-extracao.ts --provedor ambos --modelos-ollama llama3.2:3b \
  --modos direto,direto+dicas --salvar          # → docs/AVALIACAO_IA.md
npx tsx scripts/gerar-workflow-n8n.ts           # workflow com o refine novo; reimportado e publicado
```
- Gemini (reserva `flash-lite`): 90–97% na rodada oficial; 98% na validação na rodada anterior. A variação entre rodadas fica entre 90% e 98%.
- `llama3.2:3b` direto: 61% com 0 indevidos nas duas rodadas.
- n8n com Ollama: 3 eventos simultâneos, todos 201.
- Depois: `npm run db:seed` para limpar a demo.

---

## Etapa 9 — Extra T2: resumo diário no Telegram (15/10/2026)

**Objetivo:** §12.2 e item T2 do §19. Decisão D54.

### 9.1 Sistema
- `lib/rules/digest.ts`: `buildDigest` (corpo do endpoint) e `buildDigestMessage` (texto do Telegram).
- `app/api/agenda/hoje/route.ts`: passou a usar o digest.
- `lib/app-url.ts`: URL confiável, agora compartilhada com o simulador.
- `formatLongDate` foi para `lib/dates.ts` (tela Hoje e resumo).
- Testes: `tests/unit/digest.test.ts` (tudo em dia, plurais, orçamentos parados, sem telefone/e-mail, limite de 5 itens, URL) e `tests/unit/agenda-route.test.ts` (401). Ao todo, 179 passando.
- Produção conferida após o deploy: `curl -H "authorization: Bearer $AGENT_API_TOKEN" https://virtu-pneus-central.vercel.app/api/agenda/hoje`.

### 9.2 Telegram e n8n
- Bot criado pelo Caio no @BotFather, com o token colocado em `.env.local`, sem passar pelo chat.
- Chat id descoberto por `getUpdates`, depois do "oi" enviado ao bot.
- Credencial `telegramApi` importada a partir de arquivo temporário, apagado do container e do disco.
- `infra/n8n/.env`: `VITO_APP_URL` aponta para a produção (mesmo banco da demo, D37) e `VITO_TELEGRAM_CHAT_ID` foi preenchido.
- `n8n execute` não serviu, por dois motivos: conflito na porta 5679 com a instância em execução e a exigência de um gatilho manual. O teste foi feito pelo botão **Execute workflow** (Playwright): os 3 nós ficaram verdes e a API do Telegram aceitou o envio. O print está em `docs/screenshots/n8n/04-resumo-diario.png`.
