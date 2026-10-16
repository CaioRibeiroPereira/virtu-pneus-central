# Roteiro de testes manuais — Central do gestor (Virtù Pneus)

Para testar o sistema como o dono da oficina usaria. Cada teste tem os passos e o resultado
esperado. Marque `[x]` no que passou e anote o que não passou na coluna **Obs.**

- **Endereço:** https://virtu-pneus-central.vercel.app · **senha:** `virtu-aro-rodizio-485`
- **Antes de começar:** abra `/simulador` (ou **Mais → Ferramentas de teste**) e clique em
  **Reiniciar demonstração**. Os dados voltam ao inicial, com datas relativas a hoje. Repita
  sempre que quiser recomeçar.
- Os nomes abaixo são da demonstração. "Hoje" é o dia em que você testar.
- Teste no **celular** e no **computador**: o menu muda (barra embaixo × menu lateral).
- Tempo: cerca de 1 h para tudo; o bloco 1 (essencial) leva 20 min.

---

## 1. Essencial (20 min)

### 1.1 Entrar e sair

| # | Passos | Esperado | OK | Obs. |
|---|---|---|---|---|
| 1 | Abra o endereço sem estar logado | Vai para a tela de login | [ ] | |
| 2 | Digite uma senha errada e clique **Entrar** | Mensagem "Senha incorreta. Tente de novo." (leva ~1 s); o cursor volta para o campo | [ ] | |
| 3 | Digite a senha certa | Abre o **Painel** | [ ] | |
| 4 | Clique **Sair** (menu lateral, ou **Mais → Sair** no celular) e depois abra `/hoje` | Volta para o login | [ ] | |
| 5 | Sem estar logado, abra `/clientes?q=ana` e entre | Depois do login, abre exatamente essa busca | [ ] | |

### 1.2 Painel (tela inicial)

| # | Passos | Esperado | OK | Obs. |
|---|---|---|---|---|
| 1 | Veja os cartões do topo | Faturamento, Serviços feitos (com ticket médio), Orçamentos enviados, Aprovação, Em aberto agora, Perdido em recusas, Mercadoria em estoque | [ ] | |
| 2 | Troque o período: **Mês passado**, **Últimos 30 dias**, **Este ano** | Os números e as datas do subtítulo mudam; a comparação ("vs. período anterior") aparece quando há dado para comparar | [ ] | |
| 3 | Veja o **Funil de vendas** | As barras diminuem de "Novo contato" até "Cliente"; cada etapa mostra quantos estão nela e a % da etapa anterior | [ ] | |
| 4 | Clique na etapa **Orçamento enviado** | Abre Clientes filtrado por essa etapa | [ ] | |
| 5 | Veja os gráficos | Faturamento dos últimos 6 meses, por tipo de serviço e "Por que perdemos" | [ ] | |
| 6 | Clique **Ver o que fazer hoje** | Abre a tela Hoje | [ ] | |

### 1.3 Hoje

| # | Passos | Esperado | OK | Obs. |
|---|---|---|---|---|
| 1 | Abra **Hoje** | Anel "0/9"; "9 contatos para fazer — 4 já atrasados" | [ ] | |
| 2 | Veja **Atrasados** | Beatriz Rocha (há 5 dias), Ricardo Alves (2), Patrícia Gomes (2), Lucas Ribeiro (1, "via Vito"), do mais antigo para o mais novo | [ ] | |
| 3 | Veja **Para hoje** | Carlos Pereira, Roberto Nunes ("Confirmar agendamento"), Marcos Oliveira (Responsável: Bruna Lima), Fernanda Costa, Juliana Santos | [ ] | |
| 4 | Painéis ao lado (embaixo no celular) | Agenda: Daniel Souza 11:30 confirmado · Vito: 3 sugestões · Estoque baixo: 3 produtos · Orçamentos parados | [ ] | |
| 5 | Clique no filtro **Pós-venda** | Só Patrícia e Juliana | [ ] | |
| 6 | Em Juliana, clique **WhatsApp** | Abre o WhatsApp com "Olá, Juliana! … saber se ficou tudo certo com o serviço" | [ ] | |
| 7 | Em Juliana, clique **Concluir** (✓) | Some da lista; aviso com **Desfazer**; anel vai para 1/9 | [ ] | |
| 8 | Clique **Desfazer** no aviso | Juliana volta; anel 0/9 | [ ] | |
| 9 | Em Lucas, clique **Adiar → Para amanhã** | Aviso "Adiado para (amanhã)"; Lucas sai dos atrasados e aparece em "Próximos 7 dias" | [ ] | |
| 10 | Em Roberto ("Confirmar agendamento"), clique **Concluir** | Aviso diz "O agendamento ficou como confirmado"; na ficha do Roberto o agendamento aparece "confirmado" | [ ] | |

### 1.4 Vito: simulador e Revisão

| # | Passos | Esperado | OK | Obs. |
|---|---|---|---|---|
| 1 | No simulador, escolha **1. Cliente novo pede orçamento** → **Processar com o Vito** | 3 respostas "Aplicado automaticamente" | [ ] | |
| 2 | Clique **Ver na ficha do cliente** | Cliente "Criado pelo Vito", veículo, orçamento e a etapa "Orçamento enviado"; itens com selo "via Vito" e "Ver trecho da conversa" | [ ] | |
| 3 | Processe a conversa 1 de novo (ou a **7. reenvio**) | "Já recebido antes: nada foi gravado de novo" | [ ] | |
| 4 | Processe **2. Cliente aprova orçamento** | "Enviado para a sua revisão" | [ ] | |
| 5 | Abra **Revisão** e aprove a sugestão do Ricardo | Aviso "Sugestão aprovada"; na ficha, orçamento aprovado e a ação "Retomar orçamento" some | [ ] | |

---

## 2. Clientes

| # | Passos | Esperado | OK | Obs. |
|---|---|---|---|---|
| 1 | Busque `andre` (sem acento) | Acha André Martins | [ ] | |
| 2 | Busque `90000-0001` e depois `ric1a23` | Acha Ricardo Alves (telefone e placa) | [ ] | |
| 3 | Etapa **Perdido** → Filtrar | Só André Martins (e outros perdidos da demo) | [ ] | |
| 4 | Marque **Só quem precisa de ação** | Só clientes com ação vencida/de hoje, sugestão pendente ou criados pelo Vito | [ ] | |
| 5 | No celular | Cartões, sem rolar para o lado; no computador, tabela | [ ] | |

### 2.1 Novo cliente (Hoje → **Novo cliente**, ou Clientes → **Novo cliente**)

| # | Passos | Esperado | OK | Obs. |
|---|---|---|---|---|
| 1 | Clique **Cadastrar** sem preencher | Erros em Nome e Telefone; o cursor vai para o primeiro campo com erro | [ ] | |
| 2 | Preencha nome, telefone `(19) 98811-2233`, e-mail `abc`, escolha **Instagram** e etapa **Perdido**, e cadastre | Erro no e-mail **e** no motivo da perda; **Instagram e Perdido continuam escolhidos** | [ ] | |
| 3 | Telefone `19900000001` (do Ricardo) | "Já existe um cliente com este telefone" + link para abrir o Ricardo | [ ] | |
| 4 | Corrija tudo e cadastre (com veículo e placa `abc-1d23`) | Abre a ficha; telefone "(19) 98811-2233"; placa "ABC1D23" | [ ] | |

### 2.2 Editar cliente

| # | Passos | Esperado | OK | Obs. |
|---|---|---|---|---|
| 1 | Abra a edição do mesmo cliente em **duas abas**; salve a cidade numa; na outra mude as observações e salve | Aviso de que o cliente foi alterado, com o que você digitou mantido; salvar de novo grava | [ ] | |
| 2 | Etapa **Perdido** sem motivo | Pede o motivo da perda | [ ] | |
| 3 | Abra **Sofia Dias** (criada pelo Vito) → Editar → Salvar sem mudar nada | O selo "Criado pelo Vito" some | [ ] | |

---

## 3. Ficha do cliente (use o cliente que você criou)

| # | Passos | Esperado | OK | Obs. |
|---|---|---|---|---|
| 1 | **Registrar atendimento**: "Telefone", "Ligou perguntando preço" | Aparece no Histórico como "Atendimento · Telefone" | [ ] | |
| 2 | **Nova próxima ação** com data **no passado** (digite a data) | Erro "Escolha hoje ou uma data futura"; o tipo escolhido continua | [ ] | |
| 3 | Ação com data de hoje e responsável **Rafael Souza** | Aparece em Próximas ações e na página do Rafael (Equipe) | [ ] | |
| 4 | **Novo orçamento** com valor `1.840` | Orçamento em aberto **R$ 1.840,00**; etapa vira "Orçamento enviado"; ação "Retomar orçamento" para daqui a 3 dias | [ ] | |
| 5 | **Usar da tabela de serviços** no orçamento | Preenche descrição e valor | [ ] | |
| 6 | **Registrar serviço feito** com data futura | Erro "Serviço feito não pode ter data futura" | [ ] | |
| 7 | Serviço com item **Bridgestone Turanza**, quantidade 99 | Erro de estoque insuficiente; produto, quantidade e "Quem fez" continuam escolhidos; nada é gravado | [ ] | |
| 8 | Mesma coisa com quantidade 1 | "Serviço registrado e estoque atualizado"; etapa "Cliente"; pós-venda em 7 dias; no Estoque, Bridgestone baixou 1 com a "Saída (serviço)" no histórico | [ ] | |
| 9 | **Novo agendamento** num dia que já passou | Erro "Escolha hoje ou uma data futura" | [ ] | |
| 10 | Agendamento **hoje** num horário que ainda não passou | "Confirmar agendamento · vence hoje" (não atrasado) | [ ] | |
| 11 | No **Próximo agendamento**: **Cancelar agendamento** | Pergunta de confirmação; a ação "Confirmar agendamento" some | [ ] | |
| 12 | **Novo veículo** sem preencher nada | Pede modelo, placa ou medida | [ ] | |
| 13 | Orçamento em aberto → **Recusado** → motivo "Achou caro" → **Confirmar recusa** | No Histórico (filtro Orçamentos): "Orçamento recusado · Motivo: Achou caro" | [ ] | |
| 14 | Filtros do **Histórico** | Cada filtro mostra só aquele tipo; "Tudo" volta | [ ] | |
| 15 | Botões **WhatsApp** e **Ligar** do cabeçalho | Abrem o WhatsApp e o discador com o número do cliente | [ ] | |

---

## 4. Revisão (Vito)

Depois de **Reiniciar demonstração**, há 3 sugestões.

| # | Passos | Esperado | OK | Obs. |
|---|---|---|---|---|
| 1 | Veja os cartões | Motivo, confiança, trecho da conversa e "Hoje no sistema × Proposta do Vito"; datas e valores legíveis | [ ] | |
| 2 | **Número desconhecido (19) 90000-0099** → "Criar novo cliente" sem nome → Aprovar | Pede o nome | [ ] | |
| 3 | Dê um nome e aprove | Cliente novo com o atendimento no histórico | [ ] | |
| 4 | **Marcos Oliveira** (conflito de cidade) → observação "Cidade certa é Sumaré" → **Rejeitar** | "Sugestão rejeitada. Nada foi alterado." Cidade continua Sumaré | [ ] | |
| 5 | **Fernanda Costa** (orçamento aprovado) → **Aprovar** | Orçamento dela aprovado; aparece em "Decididas recentemente" | [ ] | |
| 6 | Simulador → **6. Loja avisa que o serviço foi feito** → Revisão | Cartão com "Itens do estoque usados" já preenchido (4 × Goodyear) e a explicação | [ ] | |
| 7 | Troque a quantidade para 40 e aprove | Erro de estoque insuficiente; a quantidade digitada continua; nada aplicado | [ ] | |
| 8 | Volte para 4 e aprove | Aprovado; Goodyear baixa de 8 para 4 no Estoque | [ ] | |
| 9 | Simulador → **Evento personalizado (JSON)**: apague o exemplo, cole o JSON abaixo e clique **Enviar evento** | Vai para a Revisão com o motivo "A data já passou: confira" | [ ] | |
| 10 | Nesse cartão: **Aprovar** sem mudar | Aviso para corrigir a data | [ ] | |
| 11 | **Editar e aprovar**: escolha outro dia e horário nos campos de data/hora, mude o serviço | Aprovado; aparece na ficha com o dia/horário escolhidos | [ ] | |
| 12 | Num orçamento em "Editar e aprovar", valor `1.840` | Gravado como R$ 1.840,00 | [ ] | |


JSON do teste 4.9 (agendamento da Fernanda para um dia que já passou; para repetir, troque o
`event_id`):

```json
{
  "schema_version": "1.0",
  "event_id": "teste-manual-data-passada-1",
  "type": "appointment.requested",
  "occurred_at": "2026-10-16T10:00:00-03:00",
  "source": { "channel": "whatsapp", "conversation_id": "teste-manual", "message_ids": [] },
  "agent": { "name": "vito-extrator", "model": "teste", "prompt_version": "manual" },
  "confidence": 0.95,
  "evidence": "Cliente: posso levar o carro sábado de manhã?",
  "customer": { "phone": "(19) 90000-0002" },
  "data": { "scheduled_at": "2026-01-10T09:00:00-03:00", "service_type": "alinhamento" }
}
```

---

## 5. Oficina

| # | Passos | Esperado | OK | Obs. |
|---|---|---|---|---|
| 1 | **Estoque** → filtro **Estoque baixo** | Bridgestone (2), Michelin (3), Kit de pesos (6) | [ ] | |
| 2 | **Novo produto** tipo Pneu, sem medida, **Ativo** desmarcado | Erro pedindo a medida; "Ativo" continua desmarcado | [ ] | |
| 3 | Preencha a medida, preço `1.250` | Produto com R$ 1.250,00, marcado "inativo"; não aparece nos itens do serviço da ficha | [ ] | |
| 4 | Num produto: **Entrada de mercadoria** 8 | Quantidade sobe; histórico "Entrada +8" | [ ] | |
| 5 | **Ajustar pela contagem** sem motivo | Pede o motivo; com motivo, ajusta e registra | [ ] | |
| 6 | **Serviços** → novo serviço na tabela; depois desative "Rodízio de pneus" | O novo aparece em "Usar da tabela" na ficha; o desativado não | [ ] | |
| 7 | **Equipe** → novo funcionário com telefone `abc` | Erro de telefone; com `19988776655` grava "(19) 98877-6655" | [ ] | |
| 8 | Abra **Bruna Lima** | Ações pendentes dela (Marcos, Ana) | [ ] | |

---

## 6. Telegram (com o seu próprio Telegram)

| # | Passos | Esperado | OK | Obs. |
|---|---|---|---|---|
| 1 | Mande "oi" para o bot da oficina | Vito se apresenta como assistente automático e pede o telefone | [ ] | |
| 2 | Toque em **Compartilhar meu telefone** | Agradece; a conversa aparece em **Conversas** (com "Criar cadastro" se você não for cliente) | [ ] | |
| 3 | Pergunte o endereço e depois o horário | Respostas com o texto fixo da oficina | [ ] | |
| 4 | Pergunte um preço | "Recebemos sua mensagem…" e o dono é avisado no bot do resumo; nenhum preço inventado | [ ] | |
| 5 | Mande outra mensagem | O Vito fica em silêncio (a conversa passou para o dono) | [ ] | |
| 6 | Responda por **Conversas** | A resposta chega no seu Telegram | [ ] | |
| 7 | Com o n8n ligado, espere 2–3 min sem mandar nada | A conversa vai para a extração (sugestões na Revisão ou aplicadas na ficha) **uma vez só** | [ ] | |

---

## 7. Geral

| # | Passos | Esperado | OK | Obs. |
|---|---|---|---|---|
| 1 | Botão **Modo escuro/claro**; recarregue a página | O tema escolhido continua | [ ] | |
| 2 | Abra `/clientes/123` e `/qualquer-coisa` | Página "não encontrada" em português, com caminho de volta | [ ] | |
| 3 | No computador, **Mais** | Só Saúde do sistema e o Simulador (o resto já está no menu) | [ ] | |
| 4 | No celular, **Mais** | Conversas, Estoque, Serviços, Equipe, Saúde, Sair e Simulador | [ ] | |
| 5 | **Saúde do sistema** | "conectado", hora em Brasília e a contagem das tabelas | [ ] | |
| 6 | Navegue só com o teclado (Tab/Enter) por Hoje e por um formulário | Foco sempre visível; dá para concluir e adiar sem mouse | [ ] | |
| 7 | No fim, **Reiniciar demonstração** | Volta tudo ao estado inicial (as conversas do Telegram ficam) | [ ] | |

---

## Registro

| Data | Quem testou | Aparelho/navegador | Resultado | Problemas encontrados |
|---|---|---|---|---|
| | | | | |
