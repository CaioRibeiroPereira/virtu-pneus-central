# Avaliação da extração por IA

Gerado por `scripts/avaliar-extracao.ts` em 2026-10-15. Prompt direto `extracao-v2`, extração focada `focada-v1`, limiar de aplicação automática 0.85, 1 rodada(s) por conversa.

**Conjuntos:** *simulador* = as 5 conversas do simulador (o reenvio fica de fora: testa o endpoint, não a IA), usadas durante o desenvolvimento do prompt; *validacao* = 8 conversas escritas antes de ajustar o Ollama e nunca usadas para escolher exemplos (`scripts/avaliacao/conversas-validacao.json`).

**Modos:** *direto* = um pedido com os 8 tipos de evento; *focado* = classificação + um pedido por tipo (D52); *+dicas* = placas, medidas, valores e horários achados por código entram no pedido.

**Nota (por conversa):** 1 ponto por tipo de evento esperado que apareceu, 1 por campo-chave certo (valor, placa, medida, data do agendamento, status…) e 1 se a rota (aplica sozinho × revisão) bate com o gabarito. **Indevidos** = eventos que entrariam no cadastro sem o gestor ver (evento a mais com confiança alta, ou rota “aplica” onde o gabarito pede revisão) — o erro que custa caro. Eventos a mais não tiram ponto, mas aparecem em “extras”.

## Resumo

| Configuração | Conjunto | Acerto | Indevidos | Tipos | Campos-chave | Rotas | Extras | Rejeitados | Falhas | Mediana | Pior |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Gemini (gemini-3.5-flash) · direto | simulador | 86% | 2 | 7/8 | 12/12 | 6/7 | 1 | 2 | 0 | 1.7 s | 1.9 s |
| Gemini (gemini-3.5-flash) · direto | validacao | 93% | 0 | 11/11 | 17/20 | 11/11 | 1 | 3 | 0 | 1.8 s | 2.0 s |
| Gemini (gemini-3.5-flash) · direto | total | 90% | 2 | 18/19 | 29/32 | 17/18 | 2 | 5 | 0 | 1.8 s | 2.0 s |
| Ollama (llama3.2:3b) · direto | simulador | 62% | 0 | 6/8 | 6/10 | 6/6 | 2 | 0 | 0 | 7.4 s | 17.9 s |
| Ollama (llama3.2:3b) · direto | validacao | 60% | 0 | 7/11 | 12/13 | 6/7 | 1 | 4 | 0 | 11.0 s | 30.8 s |
| Ollama (llama3.2:3b) · direto | total | 61% | 0 | 13/19 | 18/23 | 12/13 | 3 | 4 | 0 | 8.1 s | 30.8 s |
| Gemini (gemini-3.5-flash) · direto+dicas | simulador | 97% | 1 | 8/8 | 13/13 | 7/8 | 0 | 0 | 0 | 1.6 s | 1.8 s |
| Gemini (gemini-3.5-flash) · direto+dicas | validacao | 98% | 1 | 11/11 | 19/20 | 11/11 | 2 | 1 | 0 | 1.7 s | 1.8 s |
| Gemini (gemini-3.5-flash) · direto+dicas | total | 97% | 2 | 19/19 | 32/33 | 18/19 | 2 | 1 | 0 | 1.7 s | 1.8 s |
| Ollama (llama3.2:3b) · direto+dicas | simulador | 48% | 0 | 5/8 | 4/8 | 5/5 | 2 | 0 | 1 | 17.0 s | 26.9 s |
| Ollama (llama3.2:3b) · direto+dicas | validacao | 69% | 3 | 8/11 | 14/15 | 7/8 | 4 | 3 | 0 | 19.1 s | 34.3 s |
| Ollama (llama3.2:3b) · direto+dicas | total | 61% | 3 | 13/19 | 18/23 | 12/13 | 6 | 3 | 1 | 17.1 s | 34.3 s |

## Por conversa

| Configuração | Conversa | Nota | Tempo | Observações |
|---|---|---|---|---|
| Gemini (gemini-3.5-flash) · direto | orcamento-cliente-novo | 12/12 | 1.8 s | respondeu o modelo reserva gemini-3.5-flash-lite |
| Gemini (gemini-3.5-flash) · direto | aprova-orcamento | 3/3 | 1.7 s | extra interaction.logged; entraria sem revisão: interaction.logged; respondeu o modelo reserva gemini-3.5-flash-lite |
| Gemini (gemini-3.5-flash) · direto | agenda-alinhamento | 4/4 | 1.7 s | rejeitado: nada da conversa sustenta: name; respondeu o modelo reserva gemini-3.5-flash-lite |
| Gemini (gemini-3.5-flash) · direto | reclamacao-pos-troca | 4/7 | 1.7 s | faltou interaction.logged; rejeitado: nada da conversa sustenta: name; respondeu o modelo reserva gemini-3.5-flash-lite |
| Gemini (gemini-3.5-flash) · direto | numero-desconhecido | 2/3 | 1.9 s | interaction.logged iria para “aplica” (esperado “revisão”); respondeu o modelo reserva gemini-3.5-flash-lite |
| Gemini (gemini-3.5-flash) · direto | val-recusa | 3/3 | 1.7 s | respondeu o modelo reserva gemini-3.5-flash-lite |
| Gemini (gemini-3.5-flash) · direto | val-servico-feito | 4/4 | 1.6 s | respondeu o modelo reserva gemini-3.5-flash-lite |
| Gemini (gemini-3.5-flash) · direto | val-email-cidade | 7/8 | 2.0 s | extra interaction.logged; email: esperado "carla.mendes@exemplo.com", veio undefined; 1 ajuste(s) do pós-processamento; respondeu o modelo reserva gemini-3.5-flash-lite |
| Gemini (gemini-3.5-flash) · direto | val-amanha-14h | 4/4 | 1.7 s | rejeitado: nada da conversa sustenta: name; respondeu o modelo reserva gemini-3.5-flash-lite |
| Gemini (gemini-3.5-flash) · direto | val-veiculo-preco-unidade | 8/9 | 1.8 s | plate: esperado "FRT4B56", veio undefined; respondeu o modelo reserva gemini-3.5-flash-lite |
| Gemini (gemini-3.5-flash) · direto | val-sem-estoque | 6/7 | 1.8 s | type: esperado "outro", veio "retorno_comercial"; rejeitado: nada da conversa sustenta: name; respondeu o modelo reserva gemini-3.5-flash-lite |
| Gemini (gemini-3.5-flash) · direto | val-aprova | 3/3 | 1.8 s | respondeu o modelo reserva gemini-3.5-flash-lite |
| Gemini (gemini-3.5-flash) · direto | val-terca-10h | 4/4 | 1.8 s | rejeitado: nada da conversa sustenta: name; respondeu o modelo reserva gemini-3.5-flash-lite |
| Ollama (llama3.2:3b) · direto | orcamento-cliente-novo | 8/12 | 17.9 s | extra interaction.logged; plate: esperado "SIM2A21", veio undefined; year: esperado 2021, veio undefined; tire_size: esperado "205/55 R16", veio undefined; quantity: esperado 4, veio undefined |
| Ollama (llama3.2:3b) · direto | aprova-orcamento | 0/3 | 7.9 s | faltou quote.status_changed; extra appointment.requested; 1 ajuste(s) do pós-processamento |
| Ollama (llama3.2:3b) · direto | agenda-alinhamento | 4/4 | 7.4 s | ok |
| Ollama (llama3.2:3b) · direto | reclamacao-pos-troca | 3/7 | 7.2 s | faltou task.suggested |
| Ollama (llama3.2:3b) · direto | numero-desconhecido | 3/3 | 5.0 s | ok |
| Ollama (llama3.2:3b) · direto | val-recusa | 3/3 | 7.5 s | ok |
| Ollama (llama3.2:3b) · direto | val-servico-feito | 0/4 | 6.4 s | faltou service.completed; rejeitado: nada da conversa sustenta: model, tire_size, year |
| Ollama (llama3.2:3b) · direto | val-email-cidade | 5/8 | 11.0 s | faltou quote.created; rejeitado: nada da conversa sustenta: model, tire_size, year |
| Ollama (llama3.2:3b) · direto | val-amanha-14h | 3/4 | 8.1 s | appointment.requested iria para “revisão” (esperado “aplica”); 1 ajuste(s) do pós-processamento |
| Ollama (llama3.2:3b) · direto | val-veiculo-preco-unidade | 4/9 | 10.5 s | faltou quote.created; plate: esperado "FRT4B56", veio undefined |
| Ollama (llama3.2:3b) · direto | val-sem-estoque | 3/7 | 30.8 s | faltou task.suggested; extra interaction.logged; rejeitado: data.due_date: use o formato AAAA-MM-DD |
| Ollama (llama3.2:3b) · direto | val-aprova | 3/3 | 15.3 s | rejeitado: nada da conversa sustenta: name |
| Ollama (llama3.2:3b) · direto | val-terca-10h | 4/4 | 11.0 s | ok |
| Gemini (gemini-3.5-flash) · direto+dicas | orcamento-cliente-novo | 12/12 | 1.6 s | respondeu o modelo reserva gemini-3.5-flash-lite |
| Gemini (gemini-3.5-flash) · direto+dicas | aprova-orcamento | 3/3 | 1.2 s | respondeu o modelo reserva gemini-3.5-flash-lite |
| Gemini (gemini-3.5-flash) · direto+dicas | agenda-alinhamento | 4/4 | 1.7 s | respondeu o modelo reserva gemini-3.5-flash-lite |
| Gemini (gemini-3.5-flash) · direto+dicas | reclamacao-pos-troca | 7/7 | 1.8 s | respondeu o modelo reserva gemini-3.5-flash-lite |
| Gemini (gemini-3.5-flash) · direto+dicas | numero-desconhecido | 2/3 | 1.2 s | interaction.logged iria para “aplica” (esperado “revisão”); respondeu o modelo reserva gemini-3.5-flash-lite |
| Gemini (gemini-3.5-flash) · direto+dicas | val-recusa | 3/3 | 1.7 s | respondeu o modelo reserva gemini-3.5-flash-lite |
| Gemini (gemini-3.5-flash) · direto+dicas | val-servico-feito | 4/4 | 1.8 s | respondeu o modelo reserva gemini-3.5-flash-lite |
| Gemini (gemini-3.5-flash) · direto+dicas | val-email-cidade | 8/8 | 1.8 s | respondeu o modelo reserva gemini-3.5-flash-lite |
| Gemini (gemini-3.5-flash) · direto+dicas | val-amanha-14h | 4/4 | 1.6 s | rejeitado: nada da conversa sustenta: name; respondeu o modelo reserva gemini-3.5-flash-lite |
| Gemini (gemini-3.5-flash) · direto+dicas | val-veiculo-preco-unidade | 9/9 | 1.4 s | respondeu o modelo reserva gemini-3.5-flash-lite |
| Gemini (gemini-3.5-flash) · direto+dicas | val-sem-estoque | 6/7 | 1.7 s | type: esperado "outro", veio "retorno_comercial"; respondeu o modelo reserva gemini-3.5-flash-lite |
| Gemini (gemini-3.5-flash) · direto+dicas | val-aprova | 3/3 | 1.5 s | respondeu o modelo reserva gemini-3.5-flash-lite |
| Gemini (gemini-3.5-flash) · direto+dicas | val-terca-10h | 4/4 | 1.7 s | extra vehicle.identified, interaction.logged; entraria sem revisão: interaction.logged; respondeu o modelo reserva gemini-3.5-flash-lite |
| Ollama (llama3.2:3b) · direto+dicas | orcamento-cliente-novo | 8/12 | 26.9 s | extra quote.status_changed; plate: esperado "SIM2A21", veio undefined; year: esperado 2021, veio undefined; tire_size: esperado "205/55 R16", veio undefined; quantity: esperado 4, veio undefined |
| Ollama (llama3.2:3b) · direto+dicas | aprova-orcamento | 0/3 | 13.4 s | faltou quote.status_changed; extra appointment.requested; 1 ajuste(s) do pós-processamento |
| Ollama (llama3.2:3b) · direto+dicas | agenda-alinhamento | — | 0.0 s | erro: The operation was aborted due to timeout |
| Ollama (llama3.2:3b) · direto+dicas | reclamacao-pos-troca | 3/7 | 17.0 s | faltou task.suggested |
| Ollama (llama3.2:3b) · direto+dicas | numero-desconhecido | 3/3 | 11.5 s | ok |
| Ollama (llama3.2:3b) · direto+dicas | val-recusa | 3/3 | 16.7 s | ok |
| Ollama (llama3.2:3b) · direto+dicas | val-servico-feito | 0/4 | 30.5 s | faltou service.completed; extra vehicle.identified, quote.created, interaction.logged; entraria sem revisão: vehicle.identified, quote.created, interaction.logged; rejeitado: nada da conversa sustenta: name |
| Ollama (llama3.2:3b) · direto+dicas | val-email-cidade | 5/8 | 20.7 s | faltou quote.created; rejeitado: nada da conversa sustenta: model |
| Ollama (llama3.2:3b) · direto+dicas | val-amanha-14h | 3/4 | 17.1 s | appointment.requested iria para “revisão” (esperado “aplica”); 1 ajuste(s) do pós-processamento |
| Ollama (llama3.2:3b) · direto+dicas | val-veiculo-preco-unidade | 8/9 | 34.3 s | total: esperado 4480, veio 1120 |
| Ollama (llama3.2:3b) · direto+dicas | val-sem-estoque | 3/7 | 19.1 s | faltou task.suggested; extra interaction.logged |
| Ollama (llama3.2:3b) · direto+dicas | val-aprova | 3/3 | 15.8 s | rejeitado: nada da conversa sustenta: name |
| Ollama (llama3.2:3b) · direto+dicas | val-terca-10h | 4/4 | 11.6 s | ok |
