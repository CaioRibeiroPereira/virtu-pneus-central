# Avaliação da extração por IA

Gerado por `scripts/avaliar-extracao.ts` em 2026-10-15. Prompt `extracao-v2`, limiar de aplicação automática 0.85, 1 rodada(s) por conversa, 5 conversas fictícias do simulador (o reenvio fica de fora: testa o endpoint, não a IA).

**Como a nota é calculada (por conversa):** 1 ponto por tipo de evento esperado que apareceu, 1 por campo-chave certo (valor do orçamento, placa, medida, data do agendamento, status…) e 1 se a rota (aplica sozinho × fila de revisão) bate com o gabarito. Eventos a mais não tiram ponto, mas aparecem na coluna “extras”. **Indevidos** = eventos que entrariam no cadastro sem o gestor ver (evento a mais com confiança alta, ou rota “aplica” onde o gabarito pede revisão) — o erro que custa caro. Rejeitados = itens que a IA devolveu fora do contrato e o pós-processamento descartou.

## Resumo

| Configuração | Acerto | Indevidos | Tipos | Campos-chave | Rotas | Extras | Rejeitados | Falhas | Mediana | Pior |
|---|---|---|---|---|---|---|---|---|---|---|
| Gemini (gemini-3.5-flash) | 97% | 2 | 8/8 | 13/13 | 7/8 | 1 | 0 | 0 | 3.2 s | 3.7 s |
| Ollama (qwen2.5:3b) | 59% | 0 | 7/8 | 6/12 | 4/7 | 2 | 1 | 0 | 8.0 s | 40.1 s |
| Ollama (llama3.2:3b) | 62% | 0 | 6/8 | 6/10 | 6/6 | 2 | 0 | 0 | 8.7 s | 44.7 s |
| Ollama (qwen2.5:7b) | 48% | 5 | 4/8 | 6/8 | 4/4 | 7 | 1 | 0 | 42.9 s | 75.2 s |

## Por conversa

| Configuração | Conversa | Nota | Tempo | Observações |
|---|---|---|---|---|
| Gemini (gemini-3.5-flash) | orcamento-cliente-novo | 12/12 | 3.7 s | respondeu o modelo reserva gemini-3.5-flash-lite |
| Gemini (gemini-3.5-flash) | aprova-orcamento | 3/3 | 3.2 s | respondeu o modelo reserva gemini-3.5-flash-lite |
| Gemini (gemini-3.5-flash) | agenda-alinhamento | 4/4 | 1.6 s | extra customer.upserted; entraria sem revisão: customer.upserted; respondeu o modelo reserva gemini-3.5-flash-lite |
| Gemini (gemini-3.5-flash) | reclamacao-pos-troca | 7/7 | 2.2 s | respondeu o modelo reserva gemini-3.5-flash-lite |
| Gemini (gemini-3.5-flash) | numero-desconhecido | 2/3 | 3.6 s | interaction.logged iria para “aplica” (esperado “revisão”); respondeu o modelo reserva gemini-3.5-flash-lite |
| Ollama (qwen2.5:3b) | orcamento-cliente-novo | 9/12 | 40.1 s | extra quote.status_changed; plate: esperado "SIM2A21", veio undefined; year: esperado 2021, veio undefined; quantity: esperado 4, veio undefined |
| Ollama (qwen2.5:3b) | aprova-orcamento | 3/3 | 8.0 s | extra quote.created; 1 ajuste(s) do pós-processamento |
| Ollama (qwen2.5:3b) | agenda-alinhamento | 2/4 | 6.7 s | scheduled_at: esperado "2026-10-17T12:00:00.000Z", veio "2026-10-19T09:00:00-03:00"; appointment.requested iria para “revisão” (esperado “aplica”); 1 ajuste(s) do pós-processamento |
| Ollama (qwen2.5:3b) | reclamacao-pos-troca | 3/7 | 12.8 s | type: esperado "pos_venda", veio "followup_orcamento"; due_date: esperado "2026-10-15", veio "2026-10-16"; interaction.logged iria para “revisão” (esperado “aplica”); task.suggested iria para “revisão” (esperado “aplica”) |
| Ollama (qwen2.5:3b) | numero-desconhecido | 0/3 | 3.3 s | faltou interaction.logged; 1 rejeitado(s) (nada da conversa sustenta: name) |
| Ollama (llama3.2:3b) | orcamento-cliente-novo | 8/12 | 44.7 s | extra interaction.logged; plate: esperado "SIM2A21", veio undefined; year: esperado 2021, veio undefined; tire_size: esperado "205/55 R16", veio undefined; quantity: esperado 4, veio undefined |
| Ollama (llama3.2:3b) | aprova-orcamento | 0/3 | 8.7 s | faltou quote.status_changed; extra appointment.requested; 1 ajuste(s) do pós-processamento |
| Ollama (llama3.2:3b) | agenda-alinhamento | 4/4 | 8.8 s | ok |
| Ollama (llama3.2:3b) | reclamacao-pos-troca | 3/7 | 8.1 s | faltou task.suggested |
| Ollama (llama3.2:3b) | numero-desconhecido | 3/3 | 5.2 s | ok |
| Ollama (qwen2.5:7b) | orcamento-cliente-novo | 10/12 | 75.2 s | plate: esperado "SIM2A21", veio undefined; quantity: esperado 4, veio undefined; 1 ajuste(s) do pós-processamento |
| Ollama (qwen2.5:7b) | aprova-orcamento | 0/3 | 50.0 s | faltou quote.status_changed; extra customer.upserted, vehicle.identified, quote.created, appointment.requested; entraria sem revisão: customer.upserted, vehicle.identified; 4 ajuste(s) do pós-processamento |
| Ollama (qwen2.5:7b) | agenda-alinhamento | 4/4 | 18.9 s | ok |
| Ollama (qwen2.5:7b) | reclamacao-pos-troca | 0/7 | 42.9 s | faltou interaction.logged, task.suggested; extra customer.upserted, vehicle.identified; entraria sem revisão: customer.upserted, vehicle.identified; 1 rejeitado(s) (data.due_date: use o formato AAAA-MM-DD) |
| Ollama (qwen2.5:7b) | numero-desconhecido | 0/3 | 8.8 s | faltou interaction.logged; extra vehicle.identified; entraria sem revisão: vehicle.identified |
