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
| Testes | nenhum | 152 de unidade/integração, 7 E2E com axe, banco de testes da IA |

Prints: antes em [`docs/diagnostico-screenshots/`](docs/diagnostico-screenshots/), depois em
[`docs/screenshots/depois/`](docs/screenshots/depois/) (375 e 1280 px de cada tela).

## Testes realizados

| Tipo | Ferramenta | Resultado |
|---|---|---|
| Unidade + integração | Vitest; Postgres em memória (PGlite) com as **migrações reais** | **152 passando**: datas/fuso, telefone, busca, auth, regras R1–R4, endpoint (401/413/415/422, idempotência, matching, decisão, conflito com edição humana, eventos simultâneos), revisão, extração da IA |
| E2E | Playwright (Chrome) | **12 passando** localmente e **contra a produção**: concluir ação → linha do tempo; simulador → aplica, reenvio ignorado, alto impacto → revisão → aprovar → ficha |
| Acessibilidade automática | axe-core (WCAG 2.0/2.1/2.2 A e AA) | **0 violações** em login, Hoje, Clientes, Ficha, Novo/Editar cliente, Mais, Revisão e Simulador, em 375 e 1280 px, nos temas claro e escuro |
| Lighthouse 13.5 (produção) | ver tabela abaixo | Acessibilidade 100 em todas |
| IA | `scripts/avaliar-extracao.ts` | ver [`docs/AVALIACAO_IA.md`](docs/AVALIACAO_IA.md) e a seção abaixo |
| Navegação guiada | Playwright na produção | roteiro da demo percorrido em 375 e 1280 px, com prints de cada tela |

**Lighthouse — produção, 15/10/2026** (acessibilidade / desempenho / boas práticas / SEO):

| Tela | Celular | Computador |
|---|---|---|
| Login | 100 / 96 / 100 / 100 | 100 / 100 / 100 / 100 |
| Hoje | 100 / 86 / 100 / 90 | 100 / 97 / 100 / 90 |
| Clientes | 100 / 95 / 100 / 90 | 100 / 100 / 100 / 90 |
| Ficha do cliente | 100 / 97 / 100 / 90 | 100 / 100 / 100 / 90 |
| Revisão | 100 / 99 / 100 / 90 | 100 / 100 / 100 / 90 |
| Simulador | 100 / 99 / 100 / 90 | 100 / 100 / 100 / 90 |

Antes (diagnóstico): acessibilidade 89–95. O SEO 90 vem só do link **"Mais"** do menu inferior,
que o Lighthouse marca como texto genérico. Mantive o "Mais" de propósito: é o padrão de barra
inferior no celular e o painel é privado, atrás de login. O desempenho de 86 no Hoje (celular) é sob
4G lento simulado, com LCP de 1,4 s e nenhum deslocamento de layout.

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
| T10 — Modo escuro | feito, junto com o novo visual "Amigável" escolhido pelo dono (D55): tema do aparelho por padrão, botão sol/lua, contraste validado pelo axe nos dois temas |
| T2 — Resumo diário + `GET /api/agenda/hoje` | feito: às 7h45 o dono recebe no Telegram atrasados, agenda, orçamentos parados e revisões pendentes, com o link do painel; mensagem montada e testada no sistema (D54) |

## Principais decisões

Todas em [`DECISOES.md`](DECISOES.md) (D1–D57), com contexto, opções e motivo. As que mais pesaram:

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

## Limitações e próximos passos

- **Um único usuário** (o gestor) com senha compartilhada. Próximo passo: contas individuais com
  papéis, se a loja tiver mais pessoas.
- **IA medida em 5 conversas fictícias:** serve para comparar provedores e versões do prompt, não
  garante a qualidade com conversas reais. Próximo passo: anonimizar conversas reais para o teste.
- **n8n não publicado:** roda localmente (`infra/n8n`). Na demo online, o Simulador cumpre esse papel.
- **Banco compartilhado entre demo e testes E2E** (Neon gratuito, um projeto). Próximo passo: um
  branch do Neon só para testes.
- **CSP com `'unsafe-inline'`** (D33). Próximo passo: nonce por requisição.
- **Sem exclusão de cliente (LGPD)** nem PWA: itens T3/T4 da lista de extras, não feitos por prazo.
- **Acessibilidade:** os testes automáticos (axe, Lighthouse) pegam só parte dos problemas. Falta
  um teste manual completo com teclado e leitor de tela antes de dizer "AA".
