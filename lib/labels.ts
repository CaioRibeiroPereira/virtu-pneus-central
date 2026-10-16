// Rótulos em português para os valores guardados no banco (enums em snake_case).

export const serviceTypeLabel: Record<string, string> = {
  troca_pneus: "Troca de pneus",
  alinhamento: "Alinhamento",
  balanceamento: "Balanceamento",
  rodizio: "Rodízio",
  reparo: "Reparo",
  outro: "Serviço",
};

export const taskTypeLabel: Record<string, string> = {
  retorno_comercial: "Retorno comercial",
  followup_orcamento: "Acompanhar orçamento",
  pos_venda: "Pós-venda",
  confirmar_agendamento: "Confirmar agendamento",
  outro: "Contato",
};

export const stageLabel: Record<string, string> = {
  novo_contato: "Novo contato",
  em_negociacao: "Em negociação",
  orcamento_enviado: "Orçamento enviado",
  agendado: "Agendado",
  cliente: "Cliente",
  perdido: "Perdido",
};

export const reviewReasonLabel: Record<string, string> = {
  baixa_confianca: "Vito não teve certeza",
  cliente_nao_encontrado: "Cliente não encontrado",
  varios_clientes: "Mais de um cliente possível",
  conflito_edicao_humana: "Conflita com algo que você editou",
  alto_impacto: "Mexe com dinheiro: precisa da sua aprovação",
  data_passada: "A data já passou: confira",
};

/** "R$ 1.840,00" */
export function formatMoney(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export const originLabel: Record<string, string> = {
  whatsapp: "WhatsApp",
  indicacao: "Indicação",
  balcao: "Balcão",
  instagram: "Instagram",
  google: "Google",
  outro: "Outro",
};

export const quoteStatusLabel: Record<string, string> = {
  rascunho: "Rascunho",
  enviado: "Enviado, aguardando resposta",
  aprovado: "Aprovado",
  recusado: "Recusado",
  expirado: "Expirado",
};

export const appointmentStatusLabel: Record<string, string> = {
  agendado: "Agendado (a confirmar)",
  confirmado: "Confirmado",
  concluido: "Concluído",
  cancelado: "Cancelado",
  nao_compareceu: "Não compareceu",
};

export const channelLabel: Record<string, string> = {
  whatsapp: "WhatsApp",
  telefone: "Telefone",
  balcao: "Balcão",
};

/** Lista [valor, rótulo] para montar <select>. */
export const options = (labels: Record<string, string>) => Object.entries(labels);

/** O que cada evento do Vito propõe, em linguagem do dono (resumo da Revisão na tela Hoje). */
export const agentEventLabel: Record<string, string> = {
  "customer.upserted": "dados do cliente",
  "vehicle.identified": "veículo",
  "interaction.logged": "atendimento",
  "quote.created": "orçamento novo",
  "quote.status_changed": "decisão sobre orçamento",
  "appointment.requested": "agendamento",
  "task.suggested": "próxima ação",
  "service.completed": "serviço feito",
};

/** Título de cada tipo de sugestão do Vito (cartões e decisões da Revisão). */
export const agentEventTitle: Record<string, string> = {
  "customer.upserted": "Atualizar dados do cliente",
  "vehicle.identified": "Registrar veículo",
  "interaction.logged": "Registrar atendimento",
  "quote.created": "Registrar orçamento",
  "task.suggested": "Criar próxima ação",
  "appointment.requested": "Criar agendamento",
  "quote.status_changed": "Mudar situação do orçamento",
  "service.completed": "Registrar serviço feito",
};
