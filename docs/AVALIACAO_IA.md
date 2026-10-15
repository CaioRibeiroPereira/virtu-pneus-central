# Avaliação da extração por IA

Gerado por `scripts/avaliar-extracao.ts` em 2026-10-15. Prompt `extracao-v1`, limiar de aplicação automática 0.85, 1 rodada(s) por conversa, 5 conversas fictícias do simulador (o reenvio fica de fora: testa o endpoint, não a IA).

**Como a nota é calculada (por conversa):** 1 ponto por tipo de evento esperado que apareceu, 1 por campo-chave certo (valor do orçamento, placa, medida, data do agendamento, status…) e 1 se a rota (aplica sozinho × fila de revisão) bate com o gabarito. Eventos a mais não tiram ponto, mas aparecem na coluna “extras”. Rejeitados = itens que a IA devolveu fora do contrato e o pós-processamento descartou.

## Resumo

| Configuração | Acerto | Tipos | Campos-chave | Rotas | Extras | Rejeitados | Falhas | Mediana | Pior |
|---|---|---|---|---|---|---|---|---|---|
| Ollama (qwen2.5:3b) | 48% | 6/8 | 5/9 | 3/6 | 0 | 0 | 0 | 6.1 s | 11.3 s |
| Ollama (llama3.2:3b) | 62% | 6/8 | 8/9 | 4/6 | 0 | 0 | 0 | 7.1 s | 35.1 s |

## Por conversa

| Configuração | Conversa | Nota | Tempo | Observações |
|---|---|---|---|---|
| Ollama (qwen2.5:3b) | orcamento-cliente-novo | 2/12 | 6.6 s | faltou customer.upserted, vehicle.identified; quantity: esperado 4, veio undefined; quote.created iria para “revisão” (esperado “aplica”) |
| Ollama (qwen2.5:3b) | aprova-orcamento | 3/3 | 4.6 s | ok |
| Ollama (qwen2.5:3b) | agenda-alinhamento | 3/4 | 6.1 s | scheduled_at: esperado "2026-10-17T12:00:00.000Z", veio "2026-10-21T09:00:00-03:00" |
| Ollama (qwen2.5:3b) | reclamacao-pos-troca | 3/7 | 11.3 s | type: esperado "pos_venda", veio "followup_orcamento"; due_date: esperado "2026-10-15", veio "2026-10-17"; interaction.logged iria para “revisão” (esperado “aplica”); task.suggested iria para “revisão” (esperado “aplica”) |
| Ollama (qwen2.5:3b) | numero-desconhecido | 3/3 | 3.8 s | ok |
| Ollama (llama3.2:3b) | orcamento-cliente-novo | 6/12 | 35.1 s | faltou quote.created; plate: esperado "SIM2A21", veio undefined; vehicle.identified iria para “revisão” (esperado “aplica”) |
| Ollama (llama3.2:3b) | aprova-orcamento | 3/3 | 6.5 s | ok |
| Ollama (llama3.2:3b) | agenda-alinhamento | 3/4 | 9.1 s | appointment.requested iria para “revisão” (esperado “aplica”); 1 confiança(s) rebaixada(s) |
| Ollama (llama3.2:3b) | reclamacao-pos-troca | 3/7 | 7.1 s | faltou task.suggested |
| Ollama (llama3.2:3b) | numero-desconhecido | 3/3 | 5.0 s | ok |
