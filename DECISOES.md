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

## Decisões da Fase 2

**D27 — Driver WebSocket para transações (resolve a D16)** (14/10)
- Contexto: o pipeline do §8.3 lê, decide e grava em várias tabelas; sem transação, um erro no meio deixaria um evento aplicado pela metade.
- Opções: só o driver HTTP com `batch` (não permite "ler e decidir" no meio); driver WebSocket.
- Escolha: `withTransactionalDb` abre um Pool WebSocket do Neon por requisição, roda tudo em `db.transaction` e fecha a conexão no fim. Leituras simples continuam no driver HTTP.
- Motivo: atomicidade real (rollback em erro). Custo: uma conexão a mais por requisição dos agentes. Verificado contra o Neon real (seed e endpoint).

**D28 — zod 4 (resolve a D26)** (14/10)
- Escolha: zod 4.6, já que os schemas dos eventos foram escritos do zero. Tipos derivados com `z.infer` (sem duplicar tipos, §5).

**D29 — Sessão sem tabela: cookie assinado** (14/10)
- Opções: tabela de sessões; biblioteca de autenticação; cookie assinado com HMAC.
- Escolha: cookie `httpOnly` com `v1.<expira>.<HMAC-SHA256>`; senha única do gestor (D4) comparada em tempo constante; atraso fixo de 600 ms em senha errada; logout por POST.
- Motivo: simples, sem estado no servidor e suficiente para um único usuário. Limitação: não dá para "derrubar" uma sessão específica (só trocando o `SESSION_SECRET`, que derruba todas) e não há bloqueio após várias tentativas.

**D30 — Proteção em duas camadas** (14/10)
- O `proxy.ts` (nome do antigo middleware no Next 16) exige sessão em tudo, exceto `/login` e as APIs dos agentes (token próprio). Rotas e páginas conferem a sessão de novo (`hasSession`), como recomenda a documentação do Next: uma mudança no matcher não pode deixar algo aberto. A `/saude` também passou a exigir login.

**D31 — Regras de aplicação do agente** (14/10)
- `customer.upserted` só preenche campos vazios. Valor diferente em campo editado pelo gestor → revisão (`conflito_edicao_humana`); em campo não editado pelo gestor → não sobrescreve e registra em `result.ignored`.
- Cliente novo do agente (baixo risco e confiança ≥ limiar) nasce provisório; sem nome informado, recebe "Contato (19) 9xxxx-xxxx", que pode ser substituído depois.
- `varios_clientes` não acontece na prática (telefone é único); o caminho foi mantido por robustez.
- Sem `quote_id`, a aprovação/recusa mira o orçamento "enviado" mais recente do cliente (§8.2).
- Erro inesperado no processamento → 500 e nada fica gravado (rollback); o n8n pode reenviar o mesmo `event_id`.

**D32 — Abrangência das regras R2 e R4** (14/10)
- R2 vale para todo serviço; pós-vendas de serviços antigos entram no seed como concluídos.
- R4 vale para todo agendamento futuro ainda "agendado" (não só o de amanhã), vencendo na véspera: aparece antes em "Próximos 7 dias". Agendamentos passados não geram R4.

**D33 — CSP básica com `'unsafe-inline'`** (14/10)
- O Next usa scripts inline; uma CSP sem `'unsafe-inline'` exigiria nonce em cada requisição. Para o prazo, CSP básica (§11); nonce fica como próximo passo.

## Decisões da Fase 3

**D34 — Componentes nativos em vez de shadcn/Radix** (14/10)
- Contexto: o protótipo trazia shadcn/Radix (dialog, select, sidebar, tabs), fonte de vários problemas de acessibilidade do diagnóstico (selects sem nome, rótulos em inglês).
- Opções: corrigir os componentes vendorizados; usar elementos nativos do HTML.
- Escolha: `<select>`, `<input type="date">`, `<details>` e formulários nativos, com um componente `Field` próprio (rótulo visível, dica e erro via `aria-describedby`).
- Motivo: acessíveis e familiares no celular por padrão, sem JavaScript extra; saem 5 dependências (radix-ui, class-variance-authority, clsx, tailwind-merge, tw-animate-css).

**D35 — Tela herdada removida (conclui a D21)** (14/10)
- A tela antiga, a `/api/crm` e a tabela `legacy_customers` (migração 0003) saem junto com a chegada das telas novas. `/` redireciona para `/hoje`.

**D36 — Ações do gestor sem fila de revisão** (14/10)
- Orçamento criado pelo gestor nasce "enviado" (é registrado quando já foi mandado ao cliente); serviço registrado pelo gestor entra direto (a revisão é só para o que vem do agente, D6). Toda ação grava auditoria (`actor = gestor`) e ressincroniza as regras do cliente na mesma transação.

**D37 — Testes E2E com o Chrome instalado e o banco do Neon** (14/10)
- `channel: "chrome"` evita baixar navegadores (o disco C: estava cheio). Os testes de acessibilidade só leem dados; o banco de desenvolvimento é o mesmo da demo (um projeto Neon). Para testes que gravam (Fase 4), usar o seed ("Reiniciar demonstração") antes e depois. Próximo passo fora do prazo: um branch do Neon só para testes.

## Decisões da Fase 4

**D38 — Simulador chama o endpoint real por HTTP, com URL confiável** (15/10)
- Contexto: o plano pede que o simulador use o mesmo endpoint dos agentes sem expor o token ao navegador.
- Opções: chamar a função do handler direto; fazer uma requisição HTTP a partir do servidor.
- Escolha: requisição HTTP do servidor (mesmo caminho do n8n: proxy, token, validação). A URL vem do domínio de produção informado pela Vercel (`VERCEL_PROJECT_PRODUCTION_URL`) ou de `localhost`, nunca do cabeçalho `Host` da requisição.
- Motivo: montar a URL pelo `Host` permitiria forjar o cabeçalho e fazer o servidor enviar o token a outro site (SSRF). Em deploys de preview (protegidos pela Vercel) o mesmo handler roda no próprio servidor.

**D39 — Presets em JSON com marcadores de data e event_id por dia** (15/10)
- `simulator/presets/*.json` guarda só o essencial; o envelope do §8.1 e as datas (`$TODAY`, `$TODAY+N`, `$NEXT_SATURDAY@HH:MM`) são resolvidos na hora. O `event_id` é `sim-<conversa>-<n>-<dia>`: reenviar no mesmo dia mostra a idempotência; "Reiniciar demonstração" limpa e permite processar de novo.

**D40 — Aprovação na revisão reaproveita a aplicação automática** (15/10)
- `approveReview` revalida o evento (com as correções do gestor) pelo mesmo schema zod e chama `applyAgentEvent` com `actor = gestor`. Em `conflito_edicao_humana`, aprovar significa aceitar o valor do agente (`overwrite`). Cliente desconhecido exige escolher um existente ou criar um novo. Decisão auditada como `review_decision`.

**D41 — Aviso dentro da ação, não em efeito** (15/10)
- Encontrado pelo teste E2E: ao decidir, o card sai da lista (revalidação) e é desmontado antes de um `useEffect` rodar, e o gestor ficava sem confirmação. O aviso passa a ser disparado dentro da própria ação.

## Decisões da Fase 5

**D42 — IA com dois provedores e seletor (substitui a D9)** (15/10)
- Contexto: a D9 previa Gemini (plano gratuito) com Ollama só documentado. Ao detalhar a camada de IA, ficou claro que cada um resolve um problema diferente.
- Opções: só Gemini; só Ollama; os dois com um seletor.
- Escolha: os dois, com o MESMO prompt, o MESMO JSON Schema (gerado do contrato zod) e a MESMA validação; o provedor é escolhido no workflow do n8n.
  - Gemini: demo rápida e de alta qualidade, só com conversas fictícias (o plano gratuito usa o conteúdo para melhorar produtos).
  - Ollama (local, CPU): caminho para dados reais — as conversas não saem da loja (LGPD).
- Motivo: comparar com números reais (banco de testes com as 6 conversas do simulador, acerto e tempo por provedor) e defender a escolha por dados, não por opinião. A demo publicada continua usando o simulador; a IA real é mostrada em vídeo/ao vivo.

**D43 — Falhas passageiras do Gemini: novas tentativas e modelos reserva** (15/10)
- Contexto: no plano gratuito, o `gemini-3.5-flash` alternou entre 503 (alta demanda), 429 (limite) e quedas de conexão (`ECONNRESET`) no mesmo dia.
- Escolha: até 2 tentativas por modelo com espera crescente (2 s, 4 s, 8 s) para 429/5xx e falhas de rede; esgotadas, passa ao próximo de `GEMINI_FALLBACK_MODELS`. Erro de chave ou de formato (400/403) falha na hora: trocar de modelo não resolveria. No n8n, o nó HTTP usa "Retry on fail".

**D44 — Como o banco de testes dá nota** (15/10)
- Por conversa: 1 ponto por tipo de evento esperado que apareceu, 1 por campo-chave certo (valor, placa, medida, data do agendamento, status, tipo e prazo da tarefa) e 1 se a **rota** (aplica sozinho × revisão) bate com o gabarito. Texto livre (resumos) não é comparado.
- Eventos a mais não tiram ponto, mas são listados. Antes de aceitar isso, conferimos o pior caso: um `customer.upserted` com o nome usado no cumprimento ("Ótimo, Ricardo!") não sobrescreve nada, porque o agente só preenche campos vazios e conflito com edição do gestor vai para a revisão (D10).
- Motivo: a rota é o que protege o cadastro. Errar "para o lado da revisão" custa um clique do gestor; errar para "aplica" grava dado errado.

**D45 — Prompt v2: calendário pronto e regras de interpretação** (15/10)
- Os ajustes vieram dos erros medidos e valem para qualquer conversa, não para as do teste (os exemplos do prompt continuam fora do conjunto de teste):
  - nome só quando o próprio cliente se apresenta;
  - "vou ver" não é aprovação;
  - agendamento só com dia e horário confirmados pela loja;
  - significado de cada tipo de tarefa;
  - medida e placa curtas;
  - mensagem vaga ainda vira registro de atendimento, com confiança baixa;
  - lista pronta dos próximos 8 dias com o dia da semana (modelos pequenos erravam "sábado").
- O prompt foi para `lib/agent/prompt.ts`, sem dependências, para o n8n empacotá-lo sozinho.

**D46 — Workflow do n8n gerado a partir do repositório** (15/10)
- Contexto: copiar o prompt e o pós-processamento para dentro do n8n criaria duas versões que divergem com o tempo.
- Escolha: `scripts/gerar-workflow-n8n.ts` empacota (esbuild) o `buildPrompt` e o `postProcess` reais nos nós de código e embute o JSON Schema derivado do zod. Credenciais (chave do Gemini, token do endpoint) ficam só no n8n, nunca no JSON exportado.
- Custo: o nó de pós-processamento carrega o zod (cerca de 450 KB de código). É aceitável num nó de código e garante a mesma validação do banco de testes.

**D47 — Ferramentas locais fora do disco C:** (15/10)
- O C: estava com menos de 1 GB livre. O Ollama (programa e modelos, via `OLLAMA_MODELS`) e o n8n de teste ficaram no D:. O disco virtual do Docker fica no C:, então o n8n foi testado com `npx n8n`; o `docker-compose.yml` fica no repositório para quem for avaliar.
