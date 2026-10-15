# Avaliação da extração por IA

Gerado por `scripts/avaliar-extracao.ts` em 2026-10-15. Prompt `extracao-v1`, limiar de aplicação automática 0.85, 2 rodada(s) por conversa, 5 conversas fictícias do simulador (o reenvio fica de fora: testa o endpoint, não a IA).

**Como a nota é calculada (por conversa):** 1 ponto por tipo de evento esperado que apareceu, 1 por campo-chave certo (valor do orçamento, placa, medida, data do agendamento, status…) e 1 se a rota (aplica sozinho × fila de revisão) bate com o gabarito. Eventos a mais não tiram ponto, mas aparecem na coluna “extras”. Rejeitados = itens que a IA devolveu fora do contrato e o pós-processamento descartou.

## Resumo

| Configuração | Acerto | Tipos | Campos-chave | Rotas | Extras | Rejeitados | Falhas | Mediana | Pior |
|---|---|---|---|---|---|---|---|---|---|
| Gemini (gemini-3.5-flash) | 100% | 16/16 | 26/26 | 16/16 | 4 | 0 | 0 | 2.3 s | 7.2 s |

## Por conversa

| Configuração | Conversa | Nota | Tempo | Observações |
|---|---|---|---|---|
| Gemini (gemini-3.5-flash) | orcamento-cliente-novo | 12/12 | 2.3 s | respondeu o modelo reserva gemini-3.5-flash-lite |
| Gemini (gemini-3.5-flash) | aprova-orcamento | 3/3 | 7.2 s | extra interaction.logged; respondeu o modelo reserva gemini-3.5-flash-lite |
| Gemini (gemini-3.5-flash) | agenda-alinhamento | 4/4 | 1.3 s | respondeu o modelo reserva gemini-3.5-flash-lite |
| Gemini (gemini-3.5-flash) | reclamacao-pos-troca | 7/7 | 2.3 s | extra customer.upserted; respondeu o modelo reserva gemini-3.5-flash-lite |
| Gemini (gemini-3.5-flash) | numero-desconhecido | 3/3 | 1.0 s | respondeu o modelo reserva gemini-3.5-flash-lite |
| Gemini (gemini-3.5-flash) | orcamento-cliente-novo | 12/12 | 4.8 s | respondeu o modelo reserva gemini-3.5-flash-lite |
| Gemini (gemini-3.5-flash) | aprova-orcamento | 3/3 | 1.4 s | extra vehicle.identified; respondeu o modelo reserva gemini-3.5-flash-lite |
| Gemini (gemini-3.5-flash) | agenda-alinhamento | 4/4 | 1.8 s | respondeu o modelo reserva gemini-3.5-flash-lite |
| Gemini (gemini-3.5-flash) | reclamacao-pos-troca | 7/7 | 3.9 s | extra customer.upserted; respondeu o modelo reserva gemini-3.5-flash-lite |
| Gemini (gemini-3.5-flash) | numero-desconhecido | 3/3 | 1.2 s | respondeu o modelo reserva gemini-3.5-flash-lite |
