# Resumo da entrega — Central do gestor (Virtù Pneus)

**Demo:** https://virtu-pneus-central.vercel.app · senha `virtu-aro-rodizio-485` · dados fictícios
(roteiro de 5 min no [README](README.md)).

## O problema e a resposta

O dono da loja precisa saber **o que fazer hoje** e confiar no que o atendente de IA (o "Vito")
registra das conversas de WhatsApp. O protótipo original era um bom ponto de partida visual, mas não
servia para dados reais. O diagnóstico completo está em [`docs/DIAGNOSTICO.md`](docs/DIAGNOSTICO.md).

## Antes × depois

| | Protótipo original | Esta entrega |
|---|---|---|
| Segurança | `GET/POST /api/crm` **sem autenticação**: qualquer pessoa lia e sobrescrevia clientes | login do gestor (cookie assinado, 7 dias), token Bearer para agentes, CSP e cabeçalhos de segurança, comparações em tempo constante |
| Dados | cada cliente era **um JSON inteiro**, regravado a cada alteração (conflitos 409) | Postgres normalizado: clientes, veículos, orçamentos, agendamentos, serviços, tarefas, eventos de agente, revisão e `audit_log` |
| Agentes de IA | nenhuma entrada | `POST /api/agent-events`: contrato zod, idempotência, matching por telefone, decisão aplica × revisão numa transação |
| "O que fazer hoje" | métricas e 3 tarefas no fim da página | painel **Hoje**: vencidas, de hoje, agenda e orçamentos parados, com WhatsApp/ligar em um toque |
| Esquecimento | tarefas manuais genéricas | regras R1–R4 (follow-up 3 dias, pós-venda 7, retorno 180, confirmar na véspera), idempotentes |
| Controle do gestor | — | fila de **Revisão** com evidência e comparação "antes × proposto"; dinheiro sempre passa pelo gestor |
| Datas | histórico em UTC; demo "congelada" em 24/09 | fuso de São Paulo em todo lugar; seed relativo a hoje + "Reiniciar demonstração" |
| Acessibilidade | Lighthouse 89–95; **597** falhas de contraste no axe | Lighthouse **100** em todas as telas; axe **sem violações** em 375 e 1280 px, nos temas **claro e escuro**; reflow em 320 px |
| Celular | tabela e kanban rolando de lado; menu que não fecha | barra inferior, cards, alvos de 44 px |
| Testes | nenhum | 294 de unidade/integração, 13 E2E com axe, banco de testes da IA, teste exploratório como usuário |

Prints: antes em [`docs/diagnostico-screenshots/`](docs/diagnostico-screenshots/), depois em
[`docs/screenshots/depois/`](docs/screenshots/depois/) (375 e 1280 px de cada tela).

## Testes realizados

| Tipo | Ferramenta | Resultado |
|---|---|---|
| Unidade + integração | Vitest; Postgres em memória (PGlite) com as **migrações reais** | **294 passando**: datas/fuso, telefone, busca, auth, regras R1–R4, endpoint (401/413/415/422, idempotência, matching, decisão, conflito com edição humana, eventos simultâneos), revisão, extração da IA, estoque, Telegram, formulários e fluxos do teste como usuário |
| E2E | Playwright (Chrome) | **13 passando** localmente e **contra a produção**: concluir ação → linha do tempo; simulador → aplica, reenvio ignorado, alto impacto → revisão → aprovar → ficha; serviço feito pelo Vito → baixa de estoque |
| Teste como usuário | Playwright num build de produção, tela por tela, com erros de propósito | ~25 achados, todos corrigidos com teste — ex.: "1.840" virava R$ 1,84; formulário perdia as escolhas após um erro; data passada derrubava a página ([AUDITORIA, etapa 15](docs/AUDITORIA.md), D60) |
| Acessibilidade automática | axe-core (WCAG 2.0/2.1/2.2 A e AA) | **0 violações** em login, Hoje, Clientes, Ficha, Novo/Editar cliente, Mais, Revisão, Simulador, Conversas, Estoque, produto, Serviços, Equipe e funcionário, em 375 e 1280 px, nos temas claro e escuro; também na Revisão em modo de correção e nas páginas de "não encontrado" |
| Lighthouse 13.5 (produção) | ver tabela abaixo | Acessibilidade 100 em todas |
| IA | `scripts/avaliar-extracao.ts` | ver [`docs/AVALIACAO_IA.md`](docs/AVALIACAO_IA.md) e a seção abaixo |
| Navegação guiada | Playwright na produção | roteiro da demo percorrido em 375 e 1280 px, com prints de cada tela |

**Lighthouse 13.5 — produção, 16/10/2026, visual novo (D55)**, nos dois temas
(acessibilidade / desempenho / boas práticas / SEO):

| Tela | Celular — claro | Celular — escuro | Computador — claro | Computador — escuro |
|---|---|---|---|---|
| Login | 100 / 98 / 100 / 100 | 100 / 96 / 100 / 100 | 100 / 100 / 100 / 100 | 100 / 100 / 100 / 100 |
| Hoje | 100 / 94 / 100 / 90 | 100 / 93 / 100 / 90 | 100 / 97 / 100 / 90 | 100 / 96 / 100 / 90 |
| Clientes | 100 / 97 / 100 / 90 | 100 / 98 / 100 / 90 | 100 / 100 / 100 / 90 | 100 / 100 / 100 / 90 |
| Ficha do cliente | 100 / 98 / 100 / 90 | 100 / 98 / 100 / 90 | 100 / 99 / 100 / 90 | 100 / 99 / 100 / 90 |
| Revisão | 100 / 99 / 100 / 90 | 100 / 95 / 100 / 90 | 100 / 100 / 100 / 90 | 100 / 100 / 100 / 90 |
| Conversas | 100 / 99 / 100 / 90 | 100 / 94 / 100 / 90 | 100 / 99 / 100 / 90 | 100 / 100 / 100 / 90 |
| Simulador | 100 / 98 / 100 / 90 | 100 / 95 / 100 / 90 | 100 / 100 / 100 / 90 | 100 / 100 / 100 / 90 |

- **Acessibilidade 100 nas 28 medições.** Antes, no protótipo (diagnóstico): 89–95.
- **Desempenho:** de 93 a 100 (o Hoje no celular subiu de 86, no visual anterior, para 93–94).
  Medido sob 4G lento simulado: no pior caso, o maior conteúdo aparece em 2,2 s e o layout
  quase não se desloca durante o carregamento (CLS 0,001).
- **SEO 90:** vem só do link **"Mais"** do menu, que o Lighthouse marca como texto genérico.
  Mantive o "Mais" de propósito: é o padrão de menu de celular e o painel é privado, atrás de login.
- **Como medi:** sessão de login passada por cabeçalho; tema escuro emulado pela preferência do
  Chrome (`--blink-settings=preferredColorScheme=0`), conferida antes: a página abre com
  `data-theme="dark"`.

## Agentes de IA

Detalhes em [`docs/AGENTES_IA.md`](docs/AGENTES_IA.md). Resumo:

- A IA **nunca escreve no banco**: envia eventos ao endpoint, que valida e decide.
- Extração no n8n com **Gemini ou Ollama (local)**, mesmo prompt, mesmo JSON Schema (gerado do
  contrato zod) e mesmo pós-processamento — que **exige lastro** (placa, medida, cidade, horário… só
  ficam se aparecem na conversa) e recalcula a confiança.
- Banco de testes com 5 conversas fictícias ([`docs/AVALIACAO_IA.md`](docs/AVALIACAO_IA.md)):
  **Gemini 90–98%** em ~2 s; melhor modelo local **`llama3.2:3b` 61%** em ~8 s, com **nenhum** evento
  entrando no cadastro sem o gestor ver. Medido em 13 conversas: as 5 do simulador e 8 de
  validação escritas antes de ajustar o modelo local (o Gemini fez 98% nelas — o prompt generaliza). O `qwen2.5:7b` foi pior (48%) e inventou valores, o que
  levou à regra de lastro (D48).
- Testado de ponta a ponta no n8n 2.43 (Docker) com os dois provedores: os eventos chegam ao
  sistema e são aplicados ([`infra/n8n/README.md`](infra/n8n/README.md)).
- O teste mudou o projeto: prompt v2 (D45), lastro (D48), escolha do modelo local (D49) e lastro por
  origem (D53) vieram de erros medidos, não de suposição. Também mostrou o que **não** funciona: a
  extração focada, as dicas e a verificação por IA foram medidas e descartadas para o modelo local (D52).

## Extras (§19 do plano)

| Item | Situação |
|---|---|
| T1 — Workflow n8n de extração, com prints | feito: Gemini e Ollama de ponta a ponta ([`infra/n8n`](infra/n8n/README.md)) |
| T12 — Ollama × Gemini com números | feito, com conjunto de validação e as estratégias testadas (D49, D52, D53) |
| Canal Telegram cliente ↔ oficina | feito (D57): o Vito responde sozinho só horário, endereço, saudação e o agendamento que está no sistema; o resto vai para o dono, que responde pela ficha. Conversas passam pela mesma extração do WhatsApp |
| Estoque, tabela de serviços e equipe | feito (D58): baixa automática e atômica ao registrar serviço — inclusive o serviço feito avisado pelo Vito, com a baixa sugerida e confirmada pelo gestor na Revisão (D59); estoque nunca negativo; falta de item desfaz o serviço, histórico de movimentações, alerta de estoque baixo; tabela de preços que preenche orçamentos; responsável nas ações e serviços |
| Painel financeiro com funil de vendas (tela inicial) | feito (D61): faturamento, ticket médio, aprovação, perdas e valor em aberto por período, comparados com o período anterior; funil acumulado com conversão e valor parado por etapa; gráficos dos últimos 6 meses, por serviço e motivos de perda |
| T10 — Modo escuro | feito, junto com o novo visual "Amigável" escolhido pelo dono (D55): tema do aparelho por padrão, botão sol/lua, contraste validado pelo axe nos dois temas |
| T2 — Resumo diário + `GET /api/agenda/hoje` | feito: às 7h45 o dono recebe no Telegram atrasados, agenda, orçamentos parados e revisões pendentes, com o link do painel; mensagem montada e testada no sistema (D54) |

## Principais decisões

Todas em [`DECISOES.md`](DECISOES.md) (D1–D64), com contexto, opções e motivo. As que mais pesaram:

- **D2 — Next.js + Vercel + Neon + Drizzle:** o vinext do original é beta e o limite de 10 ms de
  CPU do Workers gratuito é risco para renderizar no servidor; Next usa a mesma estrutura `app/`,
  então o visual foi reaproveitado.
- **D5 — Modelo normalizado + auditoria no servidor:** pré-requisito para um agente escrever sem
  conflito e para o gestor confiar no histórico.
- **D6 — "IA sugere, gestor decide no que mexe com dinheiro":** aprovação de orçamento e serviço
  feito sempre vão para a revisão.
- **D8 — Simulador interno:** o avaliador testa a camada de agentes sem instalar n8n nem IA.
- **D31 — Agente só preenche campos vazios:** nunca sobrescreve o que o gestor editou (conflito vai
  para a revisão).
- **D38 — URL confiável no simulador:** evita SSRF via cabeçalho `Host`.
- **D42 — Dois provedores de IA com seletor:** qualidade (Gemini) × privacidade/LGPD (Ollama),
  comparados com números.
- **D60 — O que mudou depois de usar o sistema como usuário:** a etapa do funil acompanha os fatos,
  "Confirmar agendamento" confirma, datas conferidas no servidor, valor em reais como se escreve no
  Brasil e formulários que não perdem o que foi escolhido.

## Limitações e próximos passos

- **Um único usuário** (o gestor) com senha compartilhada. Próximo passo: contas individuais com
  papéis, se a loja tiver mais pessoas.
- **IA medida em 5 conversas fictícias:** serve para comparar provedores e versões do prompt, não
  garante a qualidade com conversas reais. Próximo passo: anonimizar conversas reais para o teste.
- **n8n não publicado:** roda localmente (`infra/n8n`). Na demo online, o Simulador cumpre esse papel.
- **Banco compartilhado entre demo e testes E2E** (Neon gratuito, um projeto). Próximo passo: um
  branch do Neon só para testes.
- **CSP com `'unsafe-inline'`** (D33). Próximo passo: nonce por requisição.
- **Sem PWA** (item T4 dos extras). A exclusão de cliente (LGPD) e a correção/exclusão de orçamento e
  serviço foram feitas (D64); atendimento e agendamento ainda não se editam (o agendamento se cancela).
- **Acessibilidade:** os testes automáticos (axe, Lighthouse) pegam só parte dos problemas. Falta
  um teste manual completo com teclado e leitor de tela antes de dizer "AA".
