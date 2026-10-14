# Registro de decisões

Formato: **contexto → opções → escolha → motivo**. Decisões D1–D13 vêm do `docs/PLANO_DESENVOLVIMENTO.md` (§2); as seguintes surgiram durante o desenvolvimento.

## Decisões do plano

**D1 — Repositório próprio**
- Contexto: o código-base está no monorepo da Virtù, que guarda projetos de clientes reais.
- Opções: trabalhar numa branch do monorepo; repositório próprio.
- Escolha: repositório privado próprio, com só a pasta `sistema_atendimento_pneus` (commit `4e50324`, snapshot de `virtuvito/projetos@1609d51`).
- Motivo: sem risco de push indevido no repo da empresa; o histórico mostra o meu processo; segredos e deploy sob meu controle.

**D2 — Stack: Next.js + Vercel + Neon + Drizzle**
- Contexto: o protótipo usa vinext (beta) em Cloudflare Workers + D1.
- Opções: manter Workers + D1; Next.js na Vercel com Neon; reescrever em Node (Fastify/Nest) + Render.
- Escolha: Next.js 16 (≥ 16.3.8) na Vercel, Postgres no Neon, Drizzle.
- Motivo: stack que domino e consigo defender; vinext é beta; o limite de 10 ms de CPU do Workers Free é risco para SSR; a pasta `app/` e o visual são reaproveitados.

**D3 — Manter a identidade visual, reescrever o miolo**
- Contexto: o protótipo tem boa aparência, mas modelo de dados, API e telas impedem o objetivo.
- Escolha: manter paleta verde e tipografia; reescrever modelo, API, telas e CSS.
- Motivo: o valor do protótipo estava na aparência, não na estrutura.

**D4 — Autenticação simples**
- Opções: multiusuário com papéis; senha única do gestor.
- Escolha: senha única do gestor (cookie `httpOnly` assinado) e token próprio para o endpoint dos agentes.
- Motivo: protege os dados pessoais sem a complexidade de vários usuários.

**D5 — Modelo normalizado + auditoria no servidor**
- Contexto: hoje o cliente inteiro é um JSON regravado a cada mudança, o que gera conflitos com agentes.
- Escolha: tabelas por entidade e `audit_log` gravado só pelo servidor.
- Motivo: agente e gestor alteram entidades diferentes sem conflito; o histórico fica confiável.

**D6 — "IA sugere, gestor decide no que mexe com dinheiro"**
- Escolha: alta confiança aplica só mudanças de baixo risco; o resto vai para a fila de revisão.
- Motivo: confiança do dono no sistema; evita erro caro de extração.

**D7 — Persona "Vito"** para o agente na interface: já existe no protótipo e dá rosto à automação.

**D8 — Simulador interno como caminho principal da demo**; n8n é bônus: os avaliadores usam o simulador pelo link, e o n8n roda local.

**D9 — IA no n8n:** Gemini (plano gratuito) só com dados fictícios, porque o plano gratuito usa o conteúdo para melhorar produtos; Ollama documentado como alternativa "os dados não saem da loja".

**D10 — Seed relativo a hoje + "Reiniciar demonstração"**: a demo original "envelhecia" e parecia toda atrasada.

**D11 — Datas:** `timestamptz` em UTC no banco; exibição e regras de "hoje" em `America/Sao_Paulo`. Corrige o bug de hora no histórico.

**D12 — Deploy pela CLI da Vercel**: funciona sem permissões especiais no GitHub.

**D13 — Onde publicar e como entregar:** aguardando a Virtù. Padrão: Vercel na minha conta + repositório privado com acesso para eles.

## Decisões da Fase 0

**D14 — npm em vez de pnpm** (14/10)
- Contexto: o protótipo usava pnpm 11; o suporte da Vercel a essa versão não estava confirmado.
- Opções: pnpm 11; pnpm 10; npm.
- Escolha: npm (`package-lock.json`).
- Motivo: padrão da Vercel sem configuração extra e ferramenta que já uso. Consequência: onde o plano diz `pnpm audit`, usar `npm audit`.

**D15 — Versões conservadoras nas ferramentas** (14/10)
- Contexto: havia versões novas com mudanças grandes: TypeScript 7 (compilador nativo), ESLint 10, zod 4, React 19.3.
- Escolha: Next 16.4.0; manter TypeScript 5.9, ESLint 9, zod 3 e React 19.2.
- Motivo: compatibilidade conhecida com o Next 16 e prazo curto. Revisar o ESLint 10 depois da entrega (o npm avisa que o 9 saiu do suporte); avaliar zod 4 na Fase 1, ao reescrever os schemas.

**D16 — Driver HTTP do Neon** (14/10)
- Opções: driver HTTP (`neon-http`); WebSocket/Pool.
- Escolha: `drizzle-orm/neon-http`.
- Motivo: cada consulta é uma requisição HTTPS, ideal para funções serverless. Limitação: não há transação interativa; para gravar várias tabelas juntas (§8.3) usar `db.batch` ou trocar para o driver WebSocket na Fase 2.

**D17 — Tabela `customers` em JSON mantida temporariamente** (14/10)
- Contexto: a Fase 0 só troca a infraestrutura; o modelo normalizado é a Fase 1.
- Escolha: portar a tabela e a `/api/crm` como estão (agora em `jsonb`), para a tela original continuar funcionando.
- Motivo: commits pequenos e um deploy funcionando antes de mexer no modelo. A API continua sem autenticação até a Fase 2.

**D18 — `test:e2e` fica para a Fase 4** (14/10)
- Motivo: o Playwright entra junto com os testes E2E; um script apontando para testes inexistentes falharia.

**D19 — Fim de linha LF** (14/10)
- Motivo: `.gitattributes` e Prettier com LF evitam diferenças CRLF/LF entre Windows e o build Linux da Vercel.

**D20 — Deploy automático pelo GitHub ativado (ajusta a D12)** (14/10)
- Contexto: o `vercel link --yes` conectou o repositório do GitHub ao projeto da Vercel sem perguntar.
- Opções: desconectar e manter só a CLI (D12 original); manter a conexão.
- Escolha: manter, por enquanto — cada push na `main` gera deploy de produção e cada branch ganha uma URL de preview.
- Motivo: menos passos manuais e prévia por branch. Cuidado: só fazer push na `main` com lint, tipos e build passando. Para desconectar: painel da Vercel → Settings → Git → Disconnect.

## Decisões da Fase 1

**D21 — Tabela antiga renomeada para `legacy_customers` até a Fase 3** (14/10)
- Contexto: o modelo novo usa o nome `customers`; a tela herdada ainda lê o JSON antigo.
- Opções: trocar de vez (tela publicada quebra até a Fase 3); manter a tabela antiga com outro nome.
- Escolha: `legacy_customers`, usada só pela `/api/crm` herdada; removida na Fase 3 junto com a tela antiga.
- Motivo: a URL publicada continua funcionando enquanto o modelo novo é construído.

**D22 — Índice único das tarefas automáticas (ajusta o §6)** (14/10)
- Contexto: o plano pede `UNIQUE (auto_rule, quote_id, service_id)`. No Postgres, `NULL` nunca é igual a `NULL` num índice único, então tarefas com `quote_id` nulo poderiam se repetir; e a R4 usa `appointment_id`, que não estava na chave.
- Escolha: índice único parcial em `(auto_rule, customer_id, coalesce(quote_id), coalesce(service_id), coalesce(appointment_id))`, só quando `auto_rule` não é nulo.
- Motivo: garante a idempotência de R1–R5 sem impedir tarefas manuais repetidas. Testado no Neon: a duplicata é recusada.

**D23 — Migração em duas etapas** (14/10)
- Contexto: trocar a tabela `customers` faz o `drizzle-kit generate` perguntar, de forma interativa, se é renomeação — e o terminal não responde a menus.
- Escolha: uma migração só remove a tabela antiga (gerada a partir de um schema vazio temporário) e outra só cria as novas.
- Motivo: sem perguntas, reproduzível. Os dados antigos eram só o seed fictício, que a `/api/crm` recria.

**D24 — Telefone: metadados completos e números fictícios** (14/10)
- Contexto: a versão padrão do `libphonenumber-js` aceitou "(19) 00000-1000" e um fixo sem DDD.
- Escolha: `libphonenumber-js/max` com `isValid()`; o seed usa (19) 90000-00NN.
- Motivo: matching por telefone confiável (base do §8.3). Limitação: não há faixa oficialmente reservada para números fictícios no Brasil; os links de WhatsApp da demo apontam para esses números.

**D25 — Tarefas automáticas do seed ficam para as regras da Fase 2** (14/10)
- Contexto: o seed precisa cobrir R1–R4, mas as regras só existem na Fase 2.
- Escolha: o seed cria os dados de origem (orçamentos enviados há 5/3/1 dias, serviços há 9/7/3/180/185 dias, agendamentos) e tarefas manuais; as tarefas automáticas serão geradas pelas regras (idempotentes) na Fase 2. Pós-vendas de serviços antigos entram como "concluídas" para a R2 não recriá-las.
- Motivo: uma única fonte de verdade para as regras, sem datas calculadas em dois lugares.

**D26 — zod continua na versão 3 por enquanto** (14/10)
- Contexto: a D15 previa avaliar o zod 4 na Fase 1, mas os schemas zod são escritos na Fase 2 (contrato dos eventos).
- Escolha: decidir no início da Fase 2.
