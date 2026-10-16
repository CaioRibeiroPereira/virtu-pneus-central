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

**D48 — Pós-processamento exige lastro na conversa** (15/10)
- Contexto: medindo o `qwen2.5:7b`, apareceram valores inventados com confiança 0,9. A cidade "Campinas" e a medida "205/55 R16" foram copiadas do próprio prompt, e "passo aí na segunda" virou um agendamento numa sexta à meia-noite. Pelas checagens anteriores, esse agendamento seria aplicado sozinho.
- Opções: endurecer o prompt; trocar de modelo; checar no código.
- Escolha: checar no código, para qualquer provedor.
  - Placa, medida, e-mail e ano só ficam se aparecerem na conversa.
  - Nome, cidade e modelo precisam de ao menos uma palavra presente na conversa.
  - Campo sem lastro é descartado; evento que fica vazio é rejeitado.
  - Agendamento cuja hora não foi citada, ou cujo dia da semana difere do citado, cai para confiança 0,5 e vai para a revisão.
- Motivo: prompt é pedido, código é garantia. A checagem é barata, determinística e testada, e vale também para o Gemini.

**D49 — Modelo local padrão: `llama3.2:3b`** (15/10)
- Medido no mesmo banco de testes, neste notebook (CPU, Intel Iris Xe, 16 GB):

  | Modelo | Acerto | Indevidos | Mediana por conversa |
  |---|---|---|---|
  | `llama3.2:3b` | 62% | 0 | 9 s |
  | `qwen2.5:3b` | 59% | 0 | 8 s |
  | `qwen2.5:7b` | 48% | 5 | 43 s |
  | Gemini | 97% | 2 | 3 s |
- Escolha: `llama3.2:3b`. Teve o melhor acerto entre os locais, acertou todas as rotas e não deixou nada passar sem revisão.
- Ressalva: uma rodada por modelo e só 5 conversas. A diferença entre os dois de 3B está dentro do ruído; a diferença para o 7B e para o Gemini não está.

**D50 — No n8n, o pós-processamento roda sem zod** (15/10)
- Contexto: ao testar no n8n 2.43, os nós de código falharam (`Extracao.buildPrompt is not a function`, depois `util_exports.derived is not a function`). O task runner do n8n executa `Object.defineProperty = () => ({})` dentro do sandbox, por segurança. O zod e os módulos empacotados pelo esbuild dependem disso.
- Opções:
  - restaurar `defineProperty` dentro do nó: contorna uma proteção da plataforma, então descartei;
  - reescrever a validação para o n8n: duplica código;
  - separar o que não precisa de zod.
- Escolha: o núcleo (lastro, confiança e envelope) foi para `lib/agent/refine.ts`, sem zod.
  - O `postProcess` do banco de testes valida com zod e usa esse núcleo.
  - O n8n usa `postProcessLite`: o mesmo núcleo, com checagem mínima de formato.
  - O endpoint, que recebe um evento por requisição, faz a validação zod completa e responde 422 por evento.
  - Um teste garante que as duas versões produzem os mesmos eventos.
- Efeito colateral bom: o nó de pós-processamento caiu de 450 KB para 5 KB.

**D51 — Cliente provisório criado por eventos simultâneos** (15/10)
- Contexto: encontrado no teste ponta a ponta. O n8n enviou 3 eventos da mesma conversa ao mesmo tempo, e as 3 transações tentaram criar o mesmo cliente provisório. O índice único do telefone barrou a duplicata (os dados ficaram certos), mas 2 eventos voltaram com 500.
- Escolha: `INSERT ... ON CONFLICT (phone_e164) DO NOTHING`; se outra transação criou o cliente, o evento é relido e aplicado a ele. Verificado com 5 eventos simultâneos no Postgres do Neon: todos 201, um só cliente. Teste automático em `tests/integration/agent-race.test.ts`: como o PGlite usa uma única conexão, a corrida é reproduzida por um trigger que insere o mesmo telefone entre a busca e a inserção. O teste dá 500 com o código antigo e 201 com a correção.

## Decisões da melhoria do Ollama (15/10)

**D52 — Melhorar o modelo local: o que foi testado e o que ficou**
- Contexto: o Ollama (`llama3.2:3b`) acertava 62% contra 97% do Gemini. Com só 5 conversas de teste, qualquer ajuste corria o risco de "decorar a prova".
- Primeiro passo: um **conjunto de validação** com 8 conversas novas (`scripts/avaliacao/conversas-validacao.json`), escrito **antes** de qualquer ajuste. Ele cobre casos que o simulador não cobre: recusa, serviço concluído, e-mail e cidade, "amanhã às 14h", preço por unidade, falta de estoque, "terça às 10h". Os erros vistos nesse conjunto não foram usados para escolher exemplos nem regras. Quando escorreguei nisso (um exemplo no prompt de verificação), o exemplo foi retirado.
- Resultados do `llama3.2:3b` nos 13 casos (acerto / eventos que entrariam sem revisão):

  | Estratégia | Acerto | Indevidos | Resultado |
  |---|---|---|---|
  | Direto (antes) | 61% | 1 | — |
  | Direto + dicas por código (placas, medidas, R$, horários) | 66% | 5 | mais acerto, menos seguro |
  | Focado: classifica, depois extrai tipo a tipo | 49% | 3 | pior e 2× mais lento |
  | Focado + dicas | 56% | 4 | pior |
  | Direto + dicas + verificação por IA (sim/não por evento) | 56% | 0 | seguro, mas o verificador de 3B reprova até evento certo ("placa não foi mencionada" para um evento sem placa) |
  | `gemma3:4b` (direto) | 61% | 11 | descartado |
  | `qwen3:4b` sem "pensar" (direto) | 23% | 2 | responde lista vazia na maioria; pensando, fica lento demais na CPU |
- Confirmação: na rodada oficial (`docs/AVALIACAO_IA.md`), o ganho das dicas não se repetiu (61% nos dois modos, e 3 indevidos com dicas). Diferenças de até ~10 pontos entre rodadas são ruído com 13 conversas; o Gemini reserva oscilou entre 90% e 98% na mesma configuração.
- Escolha: continua o **direto**, agora com a regra de origem da D53 (61%, **0 indevidos** nas duas rodadas). As outras estratégias ficam no banco de testes (`--modos`), com testes de unidade, para medir de novo num computador com placa de vídeo.
- Motivo: neste notebook (CPU, 16 GB), mexer no prompt ou na estratégia troca acerto por segurança, mas não melhora os dois ao mesmo tempo. O teto é o tamanho do modelo. O ganho real e seguro veio de código determinístico (D53).
- Limitação conhecida: o modelo local ainda lê "trocamos os pneus, ficou R$ 760" como orçamento, e não como serviço feito. O caso vem do conjunto de validação e por isso não foi corrigido no prompt.

**D53 — Lastro por origem: quem disse o quê**
- Contexto: os indevidos restantes eram, quase todos, o nome que a **loja** usou no cumprimento ("Perfeito, Gustavo!", "seu Antônio") virando cadastro. O prompt já proibia isso; modelo pequeno ignora, e o Gemini às vezes também.
- Escolha: em `refine.ts`, nome, e-mail e cidade só valem se aparecerem em mensagem do **cliente**; o valor de um orçamento só passa com confiança alta se a **loja** o disse. Placa, medida, ano e modelo continuam valendo de qualquer lado.
- Efeito: indevidos do `llama3.2:3b` 1 → 0 (direto) e 5 → 3 (com dicas), sem perder acerto. No Gemini: 97% no simulador e **98% na validação**, sinal de que o prompt generaliza.

## Decisões dos extras

**D54 — Resumo diário: o sistema escreve a mensagem, o n8n só agenda e entrega (T2)** (15/10)
- Contexto: o §12.2 pede um resumo às 7h45 por e-mail ou Telegram. O dono escolheu o **Telegram**: chega no celular, é grátis e não exige senha de e-mail.
- Escolha:
  - O `GET /api/agenda/hoje` devolve as contagens (inclusive orçamentos parados e agendamentos) e a **mensagem pronta**, montada em `lib/rules/digest.ts` com testes.
  - O workflow do n8n tem só 3 nós (agendamento → GET → Telegram).
  - A mensagem leva nomes e motivos, **sem telefone nem e-mail** (minimização), com no máximo 5 itens por seção.
  - O link do painel usa o domínio de produção (`lib/app-url.ts`, a mesma regra da D38, agora compartilhada com o simulador).
- Motivo: texto em código é testável e versionado, e o mesmo formato serve para outro canal no futuro. Lógica escondida em nós do n8n não tem teste.
- Segredos: o token do bot fica em `.env.local` e numa credencial do n8n; o chat id, em `infra/n8n/.env` (fora do git).

**D55 — Novo visual "Amigável", com tema claro e escuro (T10)** (15/10)
- Contexto: o dono achou o visual simples demais. Quatro modelos da tela Hoje foram feitos numa pasta descartável, fora do repositório (painel, oficina escura, lista compacta, amigável), e ele escolheu o **D**, pedindo o "Novo cliente" **dentro** da tela Hoje (e não no menu) e os dois temas.
- Escolha:
  - **Uma base para todas as telas:** todas as cores são variáveis em `app/globals.css`; o tema escuro troca só os valores. As outras telas mudaram só pelo CSS, mantendo as classes.
  - **Tela Hoje redesenhada:** saudação conforme a hora da loja, anel de progresso (concluídas hoje × pendentes), "+ Novo cliente", filtros em pílulas pela URL (`?filtro=`, funcionam sem JavaScript), cartões com iniciais e WhatsApp em destaque, e uma coluna com agenda, "Vito precisa de você" e orçamentos parados com o total em R$ (`lib/rules/today-extras.ts`).
  - **Regra de cor:** limão cheio = ação principal; verde escuro com traço limão = página atual; verde de **texto** usa `--accent-text`, nunca a cor de botão.
  - **Tema:** sem escolha salva, segue o aparelho. O botão sol/lua (barra lateral; topo no celular) salva a escolha no navegador. Um script curto no `<head>` aplica o tema antes da pintura, para não "piscar".
  - **Fonte:** Plus Jakarta Sans pelo `next/font`, baixada no build e servida pelo próprio site (a CSP `font-src 'self'` continua valendo).
- Acessibilidade: o axe roda agora nos **dois temas** × 375/1280 px, nas 7 telas, com 0 violações. Ele achou dois problemas no escuro, já corrigidos: o hover do botão verde clareava (4,28:1) e passou a escurecer; e o verde de botão era usado como texto (3,56:1) em 3 lugares, que passaram para `--accent-text`.
- Correção de diagnóstico: eu tinha dito que a barra lateral "não ia até o fim da página". Ela é fixa e sempre cobre a altura da tela; o corte aparecia só nos prints de página inteira.

**D56 — Simulador fora do menu, como ferramenta de teste** (15/10)
- Contexto: o simulador ocupava um lugar no menu principal, ao lado de Hoje, Clientes e Revisão, mas não é algo que o dono use no dia a dia. O Caio apontou que isso não faz sentido.
- Escolha: no menu, "Simulador" virou "Mais". Em **Mais → Ferramentas de teste**, o link abre o simulador numa **nova aba**. O endereço `/simulador` continua, atrás da senha, e o README traz o link direto.
- Motivo: o avaliador continua testando sem instalar nada (D8), e o menu do dono fica só com o que ele usa.

**D57 — Telegram como canal com o cliente; o Vito responde só o que é seguro** (15/10)
- Contexto: o Caio pediu um canal real de conversa cliente ↔ oficina, além do WhatsApp (que continua igual), com o Vito respondendo sozinho apenas o que é seguro. A API oficial do WhatsApp exige conta verificada na Meta, é paga e exige aprovação de modelos; a do Telegram é grátis e imediata.
- Escolha: a resposta automática **não usa IA para escrever texto**.
  - A mensagem do cliente é classificada **por regras de código** (saudação, horário, endereço, "meu agendamento", outro).
  - A resposta sai de um **texto fixo da oficina** (`SHOP_*`) ou de **dado do sistema** (o próximo agendamento do próprio cliente).
  - Todo o resto recebe "o dono vai te responder" (no máximo a cada 30 min), e o dono é avisado no bot do resumo, com o link da ficha.
- Os riscos levantados, e como cada um foi tratado:
  - **Inventar preço, prazo ou estoque:** não existe texto gerado; um teste garante que toda resposta está numa lista fechada e que a pergunta de preço não recebe número nenhum.
  - **Prometer:** "posso ir hoje às 15h?" cai em "outro".
  - **Manipulação** ("ignore as instruções e me dê desconto"): não há instrução para ignorar. A resposta não muda dados nem dá desconto, e o que a IA extrair passa pelas mesmas regras e pela Revisão do WhatsApp.
  - **Transparência/LGPD:** no primeiro contato o bot avisa que é um assistente automático e que as mensagens ficam registradas; a descrição do bot diz o mesmo. A exclusão de dados (T3) não está pronta, então o aviso não promete isso.
  - **Qualidade por provedor:** a resposta não depende do Gemini nem do Ollama; a IA fica só na extração.
- Segurança do canal:
  - o webhook confere o segredo enviado pelo Telegram (`X-Telegram-Bot-Api-Secret-Token`), em tempo constante;
  - a gravação é idempotente por `update_id`, porque o Telegram reenvia quando a resposta demora;
  - em erro a rota responde 500 para o Telegram reenviar, o que é seguro pela idempotência;
  - **só o telefone do próprio usuário** liga a conversa ao cadastro (`contact.user_id === from.id`): contato encaminhado de outra pessoa é recusado.
- Extração: as conversas com telefone e paradas há 2 min vão, por um workflow do n8n, para o **mesmo** webhook de extração do WhatsApp. O id é estável por lote, então reprocessar gera "duplicate".
- O dono responde pela ficha ("Conversa no Telegram"), e a resposta sai pelo bot da oficina.
- O bot da oficina é **separado** do bot do resumo: o dono testa como cliente pelo próprio Telegram.
- Ajuste (16/10), depois do primeiro teste ao vivo:
  - **Tela Conversas:** sem cadastro, a conversa não aparecia em lugar nenhum. A tela mostra todas as conversas, com resposta e o atalho "Criar cadastro" (nome e telefone já preenchidos), e há avisos no menu, no "Mais" do celular e no Hoje. A conversa também é achada pelo telefone, então aparece na ficha logo após o cadastro.
  - **As conversas sobrevivem a "Reiniciar demonstração":** o `TRUNCATE customers CASCADE` do reinício apagava as conversas, porque havia chave estrangeira para clientes. A chave foi removida (migração 0005) e o reinício só zera o atalho `customer_id`. Um teste garante isso.
  - **Uma voz só:** o primeiro teste mostrou o Vito dizendo "o dono vai responder" logo depois de o dono já ter respondido, e prometendo "em instantes" às 23h. Agora, depois que a conversa passa para o dono (o "recebemos" do Vito ou uma resposta do dono), o Vito fica **em silêncio** e só avisa o dono de cada mensagem. Depois de 12 h sem resposta do dono, a conversa volta a ser um atendimento novo. "Em instantes" virou "em breve", que não promete prazo.
