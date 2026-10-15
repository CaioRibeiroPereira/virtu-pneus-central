# n8n — o "Vito" extraindo dados das conversas

Workflow que recebe uma conversa de WhatsApp, pede à IA os eventos do contrato (§8.1/§8.2) e envia
cada um ao endpoint `POST /api/agent-events` do sistema. O **provedor é escolhido por conversa**
(campo `provider`) ou pelo padrão `VITO_PROVIDER` (D42):

| Provedor | Quando usar | Custo | Dados |
|---|---|---|---|
| **Gemini** (`gemini-3.5-flash`) | demonstração, melhor qualidade (90–98% no banco de testes) | plano gratuito (com limite) | saem para o Google — **só dados fictícios** |
| **Ollama** (`llama3.2:3b`, local) | dados reais (LGPD); acerta menos (61%), mas o que erra vai para a revisão | só o computador da loja | **não saem da máquina** |

```mermaid
flowchart LR
  W[Webhook<br/>Conversa do WhatsApp] --> M[Code<br/>Montar pedido à IA]
  M --> P{Qual provedor?}
  P -- ollama --> O[HTTP<br/>Ollama local]
  P -- gemini --> G[HTTP<br/>Gemini]
  G -- falhou após novas tentativas --> GR[HTTP<br/>Gemini modelo reserva]
  O --> PP[Code<br/>Pós-processar]
  G --> PP
  GR --> PP
  PP -->|1 item por evento| E[HTTP<br/>POST /api/agent-events]
```

![Workflow no n8n](../../docs/screenshots/n8n/01-workflow.png)

## Uma única fonte de verdade

`workflows/vito-extracao.json` é **gerado** por `npx tsx scripts/gerar-workflow-n8n.ts`:

- o nó **Montar pedido à IA** traz o `buildPrompt` de `lib/agent/prompt.ts` e o JSON Schema derivado
  do contrato zod (`lib/agent/schema.ts`) — o mesmo para Gemini (`responseJsonSchema`) e Ollama (`format`);
- o nó **Pós-processar** traz o `postProcessLite` de `lib/agent/refine.ts`: lastro na conversa,
  confiança recalculada, telefone vindo do metadado e nunca do texto. É o mesmo núcleo do
  `postProcess` do banco de testes, só que **sem zod**: o sandbox do n8n desativa
  `Object.defineProperty`, de que o zod depende (D50). A validação completa do contrato fica com o
  endpoint, que recebe um evento por requisição. Um teste garante que as duas versões geram os
  mesmos eventos.

Se o Gemini continuar falhando após as novas tentativas (429/503 do plano gratuito), a saída de erro
do nó leva ao **modelo reserva** (`VITO_GEMINI_FALLBACK_MODEL`). O evento registra o modelo que de
fato respondeu.

Mudou o prompt ou o contrato? Gere de novo e reimporte. O banco de testes
(`scripts/avaliar-extracao.ts`, resultado em `docs/AVALIACAO_IA.md`) usa exatamente o mesmo código.

## Subir

```bash
cp infra/n8n/.env.example infra/n8n/.env      # ajuste VITO_APP_URL / modelos
docker compose -f infra/n8n/docker-compose.yml up -d
# abra http://localhost:5678 e crie a conta de dono (fica só no volume local)
```

> No Windows, instalar o n8n pelo npm falhou ao compilar uma dependência nativa (`isolated-vm`
> exige o Visual Studio Build Tools); por isso o caminho testado é o Docker.

Ollama (opcional, para o provedor local):

```bash
ollama pull llama3.2:3b     # ~2 GB; o melhor local no banco de testes (docs/AVALIACAO_IA.md)
```

## Importar e configurar

**Pela interface:** *Workflows → Import from File* → `infra/n8n/workflows/vito-extracao.json`; crie
duas credenciais do tipo **Header Auth** e selecione nos nós (os segredos ficam só no n8n):

- *Gemini (x-goog-api-key)*: nome `x-goog-api-key`, valor = chave do Google AI Studio → nós **Gemini**
  e **Gemini (modelo reserva)**;
- *Sistema Virtù (Bearer)*: nome `Authorization`, valor = `Bearer <AGENT_API_TOKEN>` → nó
  **Enviar ao sistema**.

Depois, publique (ative) o workflow.

**Pela linha de comando** (foi assim que testei): o workflow já referencia as credenciais pelos ids
`vitoGeminiKey001` e `vitoAgentToken01`. Crie um `creds.json` **fora do repositório**:

```json
[
  { "id": "vitoGeminiKey001", "name": "Gemini (x-goog-api-key)", "type": "httpHeaderAuth",
    "data": { "name": "x-goog-api-key", "value": "<chave>" } },
  { "id": "vitoAgentToken01", "name": "Sistema Virtù (Bearer)", "type": "httpHeaderAuth",
    "data": { "name": "Authorization", "value": "Bearer <AGENT_API_TOKEN>" } }
]
```

```bash
C=$(docker compose -f infra/n8n/docker-compose.yml ps -q n8n)
docker cp creds.json $C:/tmp/creds.json && rm creds.json
docker cp infra/n8n/workflows/vito-extracao.json $C:/tmp/wf.json
docker exec $C n8n import:credentials --input=/tmp/creds.json   # o n8n criptografa ao importar
docker exec $C n8n import:workflow --input=/tmp/wf.json
docker exec $C n8n publish:workflow --id=vitoExtracao0001
docker exec -u root $C rm -f /tmp/creds.json /tmp/wf.json
docker compose -f infra/n8n/docker-compose.yml restart
```

(No Git Bash do Windows, rode antes `export MSYS_NO_PATHCONV=1`, senão os caminhos `/tmp/...`
viram caminhos do Windows.)

## Testar

```bash
curl -X POST http://localhost:5678/webhook/vito-conversa \
  -H "content-type: application/json" -d @infra/n8n/exemplo-conversa.json
```

Para escolher o provedor, mude `"provider"` no JSON (`"gemini"` ou `"ollama"`). A resposta é
imediata (o WhatsApp exige resposta rápida); o resultado aparece em **Executions** no n8n e no
sistema: cliente provisório, orçamento e agendamento aplicados, ou itens na **Revisão**
quando a confiança é baixa ou o evento mexe com dinheiro. Reenviar a mesma conversa com o mesmo
`conversation_id` não duplica nada: o endpoint responde `duplicate` (idempotência por `event_id`).

## Segurança

- Porta publicada só em `127.0.0.1` (o n8n não fica exposto na rede).
- Nenhuma chave no repositório: `infra/n8n/.env` é ignorado pelo git e as chaves ficam nas credenciais.
- O endpoint revalida tudo (token, tamanho, contrato zod) — o n8n não é confiável por padrão.
- Com o Gemini, só conversas fictícias (o plano gratuito pode usar os dados para treino).

## Resultado do teste ponta a ponta (15/10/2026)

Conversa de `exemplo-conversa.json` (Tiago, alinhamento do HB20, "amanhã às 8h"), com o sistema
rodando localmente e o mesmo banco do Neon:

| Provedor | Eventos aplicados | Tempo |
|---|---|---|
| Gemini (o principal estava sem cota; respondeu o reserva `gemini-3.5-flash-lite`) | cliente, veículo, orçamento de R$ 90 e agendamento para o dia seguinte às 8h | ~8 s |
| Ollama `llama3.2:3b` | cliente, veículo e orçamento (não extraiu o agendamento) | ~13 s |

| Gemini → modelo reserva → 4 eventos enviados | Ollama → 3 eventos enviados |
|---|---|
| ![Execução com o Gemini](../../docs/screenshots/n8n/02-execucao-gemini-reserva.png) | ![Execução com o Ollama](../../docs/screenshots/n8n/03-execucao-ollama.png) |

As execuções com erro na lista são da depuração descrita nas D50 e D51. Esse teste também revelou uma condição de corrida no endpoint quando vários eventos da mesma
conversa chegam juntos, já corrigida (D51).
