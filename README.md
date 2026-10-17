# Virtù Pneus — Central do gestor

Sistema para o dono de uma loja de pneus saber **quanto está vendendo**, **o que fazer hoje** e
**confiar no que o agente de IA registra** das conversas com os clientes. O agente se chama
**Vito**: ele lê as conversas, propõe os registros e responde no Telegram só o que é seguro. O que
mexe com dinheiro sempre passa pelo dono.

O projeto reconstrói o protótipo do desafio do Grupo Virtù. O diagnóstico do original está em
[`docs/DIAGNOSTICO.md`](docs/DIAGNOSTICO.md), e o antes × depois em
[`RESUMO_ENTREGA.md`](RESUMO_ENTREGA.md).

## Demonstração

| | |
|---|---|
| **Sistema** | https://virtu-pneus-central.vercel.app |
| **Senha do gestor** | `virtu-aro-rodizio-485` |
| **Simulador de conversas** | https://virtu-pneus-central.vercel.app/simulador (ferramenta de teste, fora do menu; também em **Mais → Ferramentas de teste**) |
| **Bot da oficina no Telegram** | **@virtu_oficina_bot** |
| **Roteiro de testes** | [`docs/ROTEIRO_DE_TESTES.md`](docs/ROTEIRO_DE_TESTES.md): passo a passo com o resultado esperado |

Os dados são 100% fictícios, com datas relativas ao dia de hoje. Em **Simulador → Reiniciar
demonstração** tudo volta ao estado inicial; as conversas reais do Telegram são preservadas.

**Em 5 minutos:**

1. **Painel:** faturamento do mês, aprovação de orçamentos e o funil de vendas.
2. **Hoje:** o que está atrasado e o que é para hoje, com WhatsApp, concluir e adiar em um toque.
3. **Simulador** (outra aba): envie "Cliente novo pede orçamento de 4 pneus". No sistema, aparecem o
   cliente criado pelo Vito, o orçamento e o lembrete de cobrança.
4. Envie "Cliente aprova orçamento enviado há dias". Como mexe com dinheiro, vai para a **Revisão**,
   onde você aprova, corrige ou rejeita.
5. Envie "A mesma conversa chega de novo": **nada duplica**.

> O banco (Neon) hiberna sem uso: o primeiro acesso do dia pode levar alguns segundos.

## O que o sistema faz

| Tela | Para quê |
|---|---|
| **Painel** (tela inicial) | Faturamento, serviços, ticket médio, aprovação de orçamentos, perdas e valor em aberto por período, comparados com o período anterior; funil de vendas com a conversão de cada etapa; gráficos dos últimos 6 meses, por serviço e motivos de perda |
| **Hoje** | Ações atrasadas e do dia (cobrar orçamento, pós-venda, retorno, confirmar agendamento), agenda, sugestões do Vito, estoque baixo e orçamentos parados |
| **Clientes** | Busca sem acento, por telefone ou placa; filtros por etapa e "precisa de ação" |
| **Ficha do cliente** | Histórico completo (o que veio do Vito tem selo e o trecho da conversa). Registra atendimento, próxima ação, orçamento (aprovar/recusar com motivo), serviço (com baixa no estoque), agendamento (confirmar/cancelar) e veículo. Orçamento e serviço podem ser **corrigidos ou excluídos**; o cliente pode ser **excluído a pedido (LGPD)**. A etapa do funil acompanha os fatos |
| **Revisão** | O que o Vito não pode aplicar sozinho: dinheiro, pouca certeza, cliente desconhecido, data que já passou, conflito com algo que o dono editou. Mostra de qual canal veio, a proposta ao lado do dado atual e permite corrigir com campos de data, valor e lista |
| **Conversas** | Telegram da oficina como um app de mensagens: lista à esquerda, conversa à direita (no celular, uma de cada vez). O dono responde, **encerra** ou **exclui** a conversa |
| **Estoque** | Pneus e itens, entrada, ajuste por contagem com motivo, histórico e alerta de estoque baixo; baixa automática ao registrar um serviço |
| **Serviços** | Tabela de serviços e preços, que preenche orçamentos e serviços na ficha |
| **Equipe** | Funcionários e o que está com cada um (responsável pelas ações e pelos serviços) |
| **Simulador** (teste) | 7 conversas fictícias de WhatsApp que chamam o endpoint real do agente, sem precisar de IA |

Celular e computador, tema claro e escuro.

**Regras automáticas** (`lib/rules/`):

- orçamento sem resposta → cobrar em 3 dias (R1);
- serviço feito → pós-venda em 7 dias (R2) e retorno comercial em 180 dias (R3);
- agendamento → confirmar na véspera, nunca antes de hoje (R4); concluir a ação confirma o
  agendamento.

As regras são idempotentes e cancelam sozinhas a ação que deixou de fazer sentido (orçamento
decidido, agendamento confirmado, cancelado ou que já passou). As datas são conferidas no servidor:
nada nasce atrasado nem "feito" no futuro.

## O Vito (agentes de IA)

- **O agente não acessa o banco.** Ele envia eventos a `POST /api/agent-events`, que valida o
  contrato (zod), ignora reenvios (`event_id`), acha o cliente pelo telefone e decide, numa
  transação, se aplica ou manda para a Revisão. Detalhes em
  [`docs/AGENTES_IA.md`](docs/AGENTES_IA.md).
- **Extração das conversas** no **n8n**, com **Gemini ou Ollama (local)**, o mesmo prompt e a mesma
  validação, que exige lastro: placa, medida, valor e horário só ficam se aparecem na conversa
  ([`infra/n8n/`](infra/n8n/README.md)). A comparação medida está em
  [`docs/AVALIACAO_IA.md`](docs/AVALIACAO_IA.md).
- **Telegram com clientes:**
  - o Vito se apresenta como assistente automático;
  - pede o telefone e, de quem ainda não é cliente, o nome, que vira o cadastro;
  - responde sozinho **só** horário, endereço e o agendamento que está no sistema;
  - o resto ele passa para o dono, avisando no bot do resumo (@virtu_resumo_bot), e fica em silêncio
    até o dono encerrar a conversa;
  - nunca inventa preço nem promete prazo;
  - as conversas paradas há 2 minutos vão para a mesma extração do WhatsApp.
- **Resumo diário:** às 7h45, o dono recebe no Telegram os atrasados, a agenda, os orçamentos parados
  e as sugestões pendentes.

![Execução do workflow no n8n: Gemini falhou por cota, o modelo reserva respondeu e 4 eventos foram enviados ao sistema](docs/screenshots/n8n/02-execucao-gemini-reserva.png)

## Segurança e LGPD

- Login do gestor com cookie assinado (`httpOnly`, 7 dias). Toda tela e toda ação conferem a
  sessão.
- Os agentes e o n8n usam um token Bearer, comparado em tempo constante. O webhook do Telegram
  confere o segredo do Telegram.
- CSP e cabeçalhos de segurança. Os segredos ficam só em variáveis de ambiente.
- Auditoria de toda gravação (quem, o quê, antes e depois), feita no servidor e na mesma transação.
- **Exclusão a pedido do titular:** apaga o cliente, as conversas e os eventos do Vito sobre ele e o
  histórico de auditoria desses registros. Fica só o registro de que houve uma exclusão.

## Qualidade

- **313 testes de unidade e integração**, com Postgres em memória (PGlite) e as migrações reais.
- **13 testes de ponta a ponta** (Playwright), também contra a produção.
- **Acessibilidade:** axe sem violações (WCAG A e AA) em todas as telas, nos dois temas, em 375 e
  1280 px, sem rolagem lateral em 320 px. Lighthouse 100 em acessibilidade.
- **Teste como usuário:** tela por tela, com erros de propósito. Foram cerca de 25 problemas,
  corrigidos com teste ([`docs/AUDITORIA.md`](docs/AUDITORIA.md), etapa 15).

## Stack

Next.js 16 (App Router) · React 19 · TypeScript estrito · Tailwind 4 · Postgres (Neon) + Drizzle ·
zod · Vitest + PGlite · Playwright + axe · n8n · Gemini/Ollama · Telegram Bot API · Vercel. As
escolhas e as alternativas estão em [`DECISOES.md`](DECISOES.md) (D1–D65).

## Rodar localmente

Requer Node.js 22.13+ e um banco Postgres (o projeto gratuito do Neon basta).

```bash
npm install
cp .env.example .env.local     # obrigatórias: DATABASE_URL, GESTOR_PASSWORD, SESSION_SECRET, AGENT_API_TOKEN
npm run db:migrate
npm run db:seed                # dados fictícios relativos a hoje
npm run dev                    # http://localhost:3000
```

- `SESSION_SECRET` e `AGENT_API_TOKEN`: valores aleatórios longos, por exemplo
  `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.
- Opcionais:
  - `GEMINI_*` / `OLLAMA_*` para a extração e a avaliação da IA;
  - `TELEGRAM_*` e `SHOP_*` para os bots;
  - o n8n sobe com Docker, como explicado em [`infra/n8n/README.md`](infra/n8n/README.md).

## Testes

```bash
npm run lint && npm run typecheck && npm run format:check
npm test                                                  # unidade + integração
npm run build && npm run test:e2e                         # ponta a ponta + acessibilidade (Chrome instalado)
E2E_BASE_URL=https://virtu-pneus-central.vercel.app npm run test:e2e   # contra a produção
npx tsx --env-file=.env.local scripts/avaliar-extracao.ts --provedor ambos --salvar   # IA
```

## Estrutura

```
app/(auth)        login                    app/(app)       telas do gestor
app/api           agent-events, agenda, telegram (webhook e n8n)
components/       interface                db/, drizzle/   schema, seed e migrações
lib/agent         contrato, decisão, aplicação, prompt, extração, provedores de IA
lib/customers     clientes, registros, etapa, exclusão (LGPD)
lib/finance       painel financeiro        lib/rules       regras R1–R4, Hoje, resumo diário
lib/review        fila de revisão          lib/telegram    bot da oficina, conversas
lib/oficina       estoque, serviços, equipe
infra/n8n         workflows e compose      scripts/        avaliação da IA, geração dos workflows
tests/            unit, integration, e2e   docs/           diagnóstico, plano, auditoria, IA, roteiro
```

## Documentos

- [`RESUMO_ENTREGA.md`](RESUMO_ENTREGA.md): antes × depois, testes e limitações.
- [`DECISOES.md`](DECISOES.md): as decisões, com contexto, opções e motivo.
- [`docs/ROTEIRO_DE_TESTES.md`](docs/ROTEIRO_DE_TESTES.md): roteiro de testes manuais.
- [`docs/AGENTES_IA.md`](docs/AGENTES_IA.md): o Vito, o contrato dos eventos e o canal Telegram.
- [`docs/AVALIACAO_IA.md`](docs/AVALIACAO_IA.md): Gemini × Ollama, com números.
- [`docs/AUDITORIA.md`](docs/AUDITORIA.md): o que foi feito em cada etapa, com os comandos.
- [`docs/PLANO_DESENVOLVIMENTO.md`](docs/PLANO_DESENVOLVIMENTO.md): o plano seguido.

## Limitações conhecidas

- **WhatsApp real não está integrado:** as conversas entram pelo simulador ou pelo n8n. O canal ao
  vivo é o Telegram.
- **A extração depende do n8n**, que roda localmente (Docker). Sem ele, o bot do Telegram continua
  respondendo, mas as conversas não viram registros.
- **"Faturamento" é a soma dos serviços registrados:** o sistema não tem caixa.
- **Um login só,** compartilhado pela equipe.
- **Atendimento e agendamento não se editam:** o agendamento se cancela.
- Detalhes em [`RESUMO_ENTREGA.md`](RESUMO_ENTREGA.md).
