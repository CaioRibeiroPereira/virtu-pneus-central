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

---

## Pendências da Fase 0 (item 4)

- [x] `.env.local` com a `DATABASE_URL` do Neon.
- [x] `npm run db:migrate` e teste local de `/saude`, da API e da tela.
- [x] `git push` dos commits da Etapa 2.
- [ ] Deploy: `vercel link` → `vercel env add DATABASE_URL` → `vercel deploy --prod`; validar `/saude` na URL pública.
