// Mensagens prontas para o link do WhatsApp, por tipo de ação (§3, item 13).
// O dono só confere e envia: o texto abre preenchido no WhatsApp dele.

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? "";

export function whatsappMessage(taskType: string, customerName: string): string {
  const nome = firstName(customerName);
  switch (taskType) {
    case "followup_orcamento":
      return `Olá, ${nome}! Aqui é da Virtù Pneus. Conseguiu ver o orçamento que enviamos? Posso ajudar com alguma dúvida?`;
    case "pos_venda":
      return `Olá, ${nome}! Aqui é da Virtù Pneus. Passando para saber se ficou tudo certo com o serviço. Qualquer coisa, estamos à disposição!`;
    case "retorno_comercial":
      return `Olá, ${nome}! Aqui é da Virtù Pneus. Já faz um tempo desde a última visita: que tal agendar um rodízio e alinhamento?`;
    case "confirmar_agendamento":
      return `Olá, ${nome}! Aqui é da Virtù Pneus. Podemos confirmar o seu horário agendado?`;
    default:
      return `Olá, ${nome}! Aqui é da Virtù Pneus.`;
  }
}
