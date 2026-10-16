// Dados fictícios da demonstração, sempre relativos a "hoje" (D10): a demo nunca envelhece.
// Função pura (sem banco) para poder ser testada e reutilizada pelo botão
// "Reiniciar demonstração" (Fase 4).
//
// Cobertura pensada para o painel "Hoje" e as regras do §7.1:
//   R1 orçamento enviado há 5 (atrasado), 3 (vence hoje) e 1 dia (próximos dias)
//   R2 serviço feito há 9 (atrasado), 7 (vence hoje) e 3 dias (próximos dias)
//   R3 troca de pneus há 185 (atrasado) e 180 dias (vence hoje)
//   R4 agendamento amanhã (confirmar hoje) e em 3 dias
//   + tarefas manuais (atrasada, hoje, próximos dias), cliente provisório criado pelo agente
//   e 3 itens na fila de revisão (alto impacto, baixa confiança, conflito com edição humana).
//
// Telefones: (19) 90000-00NN, números fictícios que passam na validação de formato.
import { randomUUID } from "node:crypto";
import { addDays, storeTimeToUtc, type DateOnly } from "@/lib/dates";
import { normalizePhone } from "@/lib/phone";
import type * as s from "./schema";

type Insert<T extends { $inferInsert: unknown }> = T["$inferInsert"];

export type SeedData = {
  customers: Insert<typeof s.customers>[];
  vehicles: Insert<typeof s.vehicles>[];
  interactions: Insert<typeof s.interactions>[];
  quotes: Insert<typeof s.quotes>[];
  services: Insert<typeof s.services>[];
  appointments: Insert<typeof s.appointments>[];
  tasks: Insert<typeof s.tasks>[];
  agentEvents: Insert<typeof s.agentEvents>[];
  reviewItems: Insert<typeof s.reviewItems>[];
  employees: Insert<typeof s.employees>[];
  serviceCatalog: Insert<typeof s.serviceCatalog>[];
  products: Insert<typeof s.products>[];
  stockMovements: Insert<typeof s.stockMovements>[];
};

export function buildSeed(today: DateOnly): SeedData {
  const day = (offset: number) => addDays(today, offset);
  const at = (offset: number, time: string) => storeTimeToUtc(day(offset), time);

  const data: SeedData = {
    customers: [],
    vehicles: [],
    interactions: [],
    quotes: [],
    services: [],
    appointments: [],
    tasks: [],
    agentEvents: [],
    reviewItems: [],
    employees: [],
    serviceCatalog: [],
    products: [],
    stockMovements: [],
  };

  // ---------- Oficina: equipe, tabela de serviços e estoque (D58) ----------

  const employee = (name: string, role: string, phoneDisplay: string) => {
    const id = randomUUID();
    data.employees.push({ id, name, role, phoneDisplay });
    return id;
  };
  const ze = employee("Zé Carlos", "Mecânico", "(19) 90000-0201");
  const rafael = employee("Rafael Souza", "Alinhador", "(19) 90000-0202");
  const bruna = employee("Bruna Lima", "Atendente", "(19) 90000-0203");

  for (const [name, type, price, durationMinutes] of [
    ["Alinhamento", "alinhamento", 90, 40],
    ["Balanceamento das 4 rodas", "balanceamento", 80, 30],
    ["Alinhamento + balanceamento", "alinhamento", 150, 60],
    ["Rodízio de pneus", "rodizio", 60, 30],
    ["Montagem de pneu (por unidade)", "troca_pneus", 25, 15],
    ["Reparo de furo", "reparo", 40, 20],
  ] as const) {
    data.serviceCatalog.push({ id: randomUUID(), name, type, price, durationMinutes });
  }

  // 3 produtos abaixo do mínimo, para o alerta de estoque baixo aparecer na demonstração.
  for (const [kind, name, tireSize, price, quantity, minQuantity] of [
    ["pneu", "Pirelli Cinturato P1", "205/55 R16", 460, 12, 4],
    ["pneu", "Michelin Primacy 4", "215/50 R17", 820, 3, 4],
    ["pneu", "Goodyear EfficientGrip", "185/60 R15", 380, 8, 4],
    ["pneu", "Bridgestone Turanza", "195/55 R16", 430, 2, 4],
    ["pneu", "Continental PremiumContact 6", "225/45 R18", 990, 4, 2],
    ["item", "Válvula de pneu", null, 8, 40, 20],
    ["item", "Kit de pesos de balanceamento", null, 12, 6, 10],
  ] as const) {
    const id = randomUUID();
    data.products.push({ id, kind, name, tireSize, price, quantity, minQuantity });
    data.stockMovements.push({
      productId: id,
      kind: "entrada",
      quantity,
      note: "Estoque inicial",
      createdAt: at(-30, "08:00"),
    });
  }

  let phoneSeq = 0;
  function customer(
    name: string,
    fields: Partial<Insert<typeof s.customers>> = {},
  ): Insert<typeof s.customers> & { id: string } {
    phoneSeq += 1;
    const phone = normalizePhone(`(19) 90000-00${String(phoneSeq).padStart(2, "0")}`);
    if (!phone) throw new Error("telefone fictício inválido no seed");
    const row = {
      id: randomUUID(),
      name,
      phoneE164: phone.e164,
      phoneDisplay: phone.display,
      city: "Campinas",
      origin: "whatsapp" as const,
      source: "gestor" as const,
      createdAt: at(-40, "10:00"),
      ...fields,
    };
    data.customers.push(row);
    return row;
  }

  function vehicle(
    customerId: string,
    model: string,
    tireSize: string,
    plate: string,
    year: number,
  ) {
    const row = {
      id: randomUUID(),
      customerId,
      model,
      tireSize,
      plate,
      year,
      source: "gestor" as const,
    };
    data.vehicles.push(row);
    return row;
  }

  function interaction(
    customerId: string,
    offset: number,
    summary: string,
    extra: Partial<Insert<typeof s.interactions>> = {},
  ) {
    data.interactions.push({
      id: randomUUID(),
      customerId,
      channel: "whatsapp",
      occurredAt: at(offset, "10:15"),
      summary,
      source: "agente",
      ...extra,
    });
  }

  /** Envelope de evento no formato do §8.1 (o contrato zod chega na Fase 2). */
  function agentEvent(fields: {
    type: string;
    status: Insert<typeof s.agentEvents>["status"];
    confidence: number;
    evidence: string;
    conversation: string;
    receivedOffset: number;
    customer: { phone: string; name?: string };
    data: Record<string, unknown>;
    customerId?: string;
    result?: unknown;
  }) {
    const id = randomUUID();
    const occurredAt = at(fields.receivedOffset, "09:40");
    const eventId = `seed-${fields.conversation}-${fields.type}`;
    data.agentEvents.push({
      id,
      eventId,
      schemaVersion: "1.0",
      type: fields.type,
      conversationId: fields.conversation,
      agentName: "vito-extrator",
      model: "gemini",
      promptVersion: "seed",
      confidence: fields.confidence,
      evidence: fields.evidence,
      payload: {
        schema_version: "1.0",
        event_id: eventId,
        type: fields.type,
        occurred_at: occurredAt.toISOString(),
        source: { channel: "whatsapp", conversation_id: fields.conversation, message_ids: [] },
        agent: { name: "vito-extrator", model: "gemini", prompt_version: "seed" },
        confidence: fields.confidence,
        evidence: fields.evidence,
        customer: fields.customer,
        data: fields.data,
      },
      receivedAt: occurredAt,
      status: fields.status,
      result: fields.result ?? null,
      customerId: fields.customerId ?? null,
    });
    return id;
  }

  // ---------- R1: orçamentos enviados aguardando resposta ----------

  const ricardo = customer("Ricardo Alves", { stage: "orcamento_enviado" });
  const civic = vehicle(ricardo.id, "Honda Civic 2021", "215/50 R17", "RIC1A23", 2021);
  const ricardoEvent = agentEvent({
    type: "quote.created",
    status: "aplicado",
    confidence: 0.94,
    evidence: "Cliente: pode me passar o valor dos 4 pneus 215/50 R17?",
    conversation: "conv-ricardo",
    receivedOffset: -5,
    customer: { phone: ricardo.phoneDisplay!, name: ricardo.name },
    data: { description: "4 pneus 215/50 R17 + alinhamento", total: 2390 },
    customerId: ricardo.id,
  });
  data.quotes.push({
    id: randomUUID(),
    customerId: ricardo.id,
    vehicleId: civic.id,
    description: "4 pneus 215/50 R17 + alinhamento",
    tireSize: "215/50 R17",
    quantity: 4,
    total: 2390,
    status: "enviado",
    sentAt: at(-5, "10:00"),
    validUntil: day(10),
    source: "agente",
    agentEventId: ricardoEvent,
  });
  interaction(ricardo.id, -5, "Pediu orçamento de 4 pneus para o Civic; orçamento enviado.", {
    agentEventId: ricardoEvent,
  });

  const fernanda = customer("Fernanda Costa", { stage: "orcamento_enviado", origin: "instagram" });
  const hb20 = vehicle(fernanda.id, "Hyundai HB20 2020", "185/60 R15", "FER2B34", 2020);
  const fernandaQuote = randomUUID();
  data.quotes.push({
    id: fernandaQuote,
    customerId: fernanda.id,
    vehicleId: hb20.id,
    description: "2 pneus 185/60 R15",
    tireSize: "185/60 R15",
    quantity: 2,
    total: 898,
    status: "enviado",
    sentAt: at(-3, "15:30"),
    validUntil: day(7),
  });
  interaction(fernanda.id, -3, "Perguntou preço de 2 pneus dianteiros; orçamento enviado.");

  const marcos = customer("Marcos Oliveira", {
    stage: "em_negociacao",
    origin: "indicacao",
    city: "Sumaré",
    humanEditedFields: ["city"],
  });
  const volvo = vehicle(marcos.id, "Volvo FH 540 (caminhão)", "295/80 R22.5", "MAR3C45", 2019);
  data.quotes.push({
    id: randomUUID(),
    customerId: marcos.id,
    vehicleId: volvo.id,
    description: "2 pneus 295/80 R22.5 para linha pesada",
    tireSize: "295/80 R22.5",
    quantity: 2,
    total: 7800,
    status: "enviado",
    sentAt: at(-1, "11:00"),
    validUntil: day(14),
  });
  interaction(marcos.id, -1, "Frota de caminhões: pediu proposta para 2 pneus de tração.", {
    channel: "telefone",
    source: "gestor",
  });

  // ---------- R2/R3: serviços realizados (pós-venda e retorno comercial) ----------

  function serviceWithHistory(
    name: string,
    model: string,
    tire: string,
    plate: string,
    type: Insert<typeof s.services>["type"],
    description: string,
    offset: number,
    total: number,
    postSaleDone: boolean,
  ) {
    const c = customer(name, { stage: "cliente" });
    const v = vehicle(c.id, model, tire, plate, 2020);
    const serviceId = randomUUID();
    data.services.push({
      id: serviceId,
      customerId: c.id,
      vehicleId: v.id,
      type,
      description,
      performedAt: at(offset, "16:00"),
      total,
      km: 42000 + Math.abs(offset) * 10,
      employeeId: type === "alinhamento" ? rafael : ze,
    });
    if (postSaleDone) {
      // Pós-venda antigo já feito: a regra R2 não deve recriar (índice único da tarefa automática).
      data.tasks.push({
        id: randomUUID(),
        customerId: c.id,
        type: "pos_venda",
        title: "Pós-venda",
        reason: "Perguntar se ficou tudo certo com o serviço",
        dueDate: day(offset + 7),
        status: "concluida",
        completedAt: at(offset + 7, "11:00"),
        serviceId,
        autoRule: "R2",
        source: "sistema",
      });
    }
    return c;
  }

  const juliana = serviceWithHistory(
    "Juliana Santos",
    "VW Polo 2022",
    "195/55 R16",
    "JUL4D56",
    "troca_pneus",
    "Troca de 4 pneus 195/55 R16",
    -7,
    1598,
    false,
  );
  interaction(juliana.id, -7, "Trocou os 4 pneus; pagou no cartão.", {
    channel: "balcao",
    source: "gestor",
  });
  serviceWithHistory(
    "Patrícia Gomes",
    "Fiat Argo 2021",
    "185/60 R15",
    "PAT5E67",
    "alinhamento",
    "Alinhamento e balanceamento",
    -9,
    180,
    false,
  );
  serviceWithHistory(
    "Paulo Teixeira",
    "Ford Ka 2019",
    "175/65 R14",
    "PAU6F78",
    "balanceamento",
    "Balanceamento das 4 rodas",
    -3,
    120,
    false,
  );
  serviceWithHistory(
    "Carlos Pereira",
    "Toyota Corolla 2020",
    "205/55 R16",
    "CAR7G89",
    "troca_pneus",
    "Troca de 4 pneus 205/55 R16",
    -180,
    2396,
    true,
  );
  serviceWithHistory(
    "Beatriz Rocha",
    "Renault Duster 2019",
    "215/65 R16",
    "BEA8H90",
    "troca_pneus",
    "Troca de 2 pneus 215/65 R16",
    -185,
    1098,
    true,
  );

  // ---------- R4: agendamentos ----------

  function scheduled(
    name: string,
    model: string,
    tire: string,
    plate: string,
    offset: number,
    time: string,
    status: Insert<typeof s.appointments>["status"],
    serviceType: Insert<typeof s.appointments>["serviceType"],
  ) {
    const c = customer(name, { stage: "agendado" });
    const v = vehicle(c.id, model, tire, plate, 2021);
    data.appointments.push({
      id: randomUUID(),
      customerId: c.id,
      vehicleId: v.id,
      scheduledAt: at(offset, time),
      serviceType,
      status,
    });
    return c;
  }

  scheduled(
    "Roberto Nunes",
    "Mercedes-Benz Atego (caminhão)",
    "275/80 R22.5",
    "ROB9I01",
    1,
    "09:00",
    "agendado",
    "troca_pneus",
  );
  scheduled(
    "Camila Ferreira",
    "Nissan Kicks 2023",
    "205/60 R16",
    "CAM0J12",
    3,
    "14:00",
    "agendado",
    "alinhamento",
  );
  scheduled(
    "Daniel Souza",
    "Fiat Toro 2022",
    "225/65 R17",
    "DAN1K23",
    0,
    "11:30",
    "confirmado",
    "rodizio",
  );

  // ---------- Perdido ----------

  const andre = customer("André Martins", {
    stage: "perdido",
    lossReason: "Comprou em outra loja",
    origin: "google",
  });
  vehicle(andre.id, "Chevrolet Onix 2020", "185/65 R15", "AND2L34", 2020);
  data.quotes.push({
    id: randomUUID(),
    customerId: andre.id,
    description: "4 pneus 185/65 R15",
    tireSize: "185/65 R15",
    quantity: 4,
    total: 1098,
    status: "recusado",
    sentAt: at(-20, "10:00"),
    respondedAt: at(-18, "17:00"),
    lossReason: "Comprou em outra loja",
  });

  // ---------- Tarefas manuais e sugeridas pelo agente ----------

  const ana = customer("Ana Barbosa", { stage: "novo_contato", origin: "balcao" });
  interaction(ana.id, -2, "Passou na loja perguntando sobre pneus aro 14; ficou de voltar.", {
    channel: "balcao",
    source: "gestor",
  });
  data.tasks.push({
    id: randomUUID(),
    customerId: ana.id,
    type: "retorno_comercial",
    title: "Retornar com opções de aro 14",
    reason: "Visitou a loja e pediu opções mais baratas",
    dueDate: day(5),
    assigneeId: bruna,
  });

  const lucas = customer("Lucas Ribeiro", { stage: "em_negociacao", origin: "instagram" });
  vehicle(lucas.id, "BMW 320i 2021", "225/45 R18", "LUC3M45", 2021);
  const lucasEvent = agentEvent({
    type: "task.suggested",
    status: "aplicado",
    confidence: 0.9,
    evidence: "Cliente: me manda foto do pneu antes de eu fechar?",
    conversation: "conv-lucas",
    receivedOffset: -2,
    customer: { phone: lucas.phoneDisplay!, name: lucas.name },
    data: { type: "outro", title: "Enviar fotos do pneu", due_date: day(-1) },
    customerId: lucas.id,
  });
  data.tasks.push({
    id: randomUUID(),
    customerId: lucas.id,
    type: "outro",
    title: "Enviar fotos do pneu",
    reason: "Cliente pediu fotos antes de fechar a compra",
    dueDate: day(-1),
    source: "agente",
    agentEventId: lucasEvent,
  });
  interaction(lucas.id, -2, "Interessado em pneus run-flat; pediu fotos antes de fechar.", {
    agentEventId: lucasEvent,
  });

  data.tasks.push({
    id: randomUUID(),
    customerId: marcos.id,
    type: "outro",
    title: "Confirmar chegada dos pneus com o fornecedor",
    reason: "Marcos quer saber o prazo de entrega antes de aprovar",
    dueDate: day(0),
    assigneeId: bruna,
  });

  // ---------- Cliente provisório criado pelo agente ----------

  const sofia = customer("Sofia Dias", {
    isProvisional: true,
    source: "agente",
    createdAt: at(0, "09:40"),
    city: null,
  });
  const sofiaEvent = agentEvent({
    type: "customer.upserted",
    status: "aplicado",
    confidence: 0.88,
    evidence: "Cliente: oi, aqui é a Sofia, queria saber de pneu pro T-Cross",
    conversation: "conv-sofia",
    receivedOffset: 0,
    customer: { phone: sofia.phoneDisplay!, name: sofia.name },
    data: { name: sofia.name, origin: "whatsapp" },
    customerId: sofia.id,
  });
  sofia.agentEventId = sofiaEvent;
  interaction(sofia.id, 0, "Primeiro contato: quer pneus para um VW T-Cross.", {
    agentEventId: sofiaEvent,
  });

  // ---------- Histórico de vendas para o Painel (D61) ----------
  // Vendas dos últimos meses (orçamento aprovado → serviço feito, pós-venda já feito), recusas com
  // motivo e contatos no começo do funil. Telefones (19) 90000-03NN: fora da faixa usada pelas
  // conversas do simulador. Nenhum item aqui cria ação para hoje: pós-venda concluído e retorno
  // (R3) só daqui a mais de uma semana.
  let historySeq = 0;
  const pastCustomer = (
    name: string,
    fields: Partial<Insert<typeof s.customers>> = {},
  ): Insert<typeof s.customers> & { id: string } => {
    historySeq += 1;
    const phone = normalizePhone(`(19) 90000-03${String(historySeq).padStart(2, "0")}`)!;
    return customer(name, {
      stage: "cliente",
      phoneE164: phone.e164,
      phoneDisplay: phone.display,
      createdAt: at(-200, "10:00"),
      ...fields,
    });
  };
  function pastSale(
    c: { id: string },
    offset: number,
    type: Insert<typeof s.services>["type"],
    description: string,
    total: number,
    employeeId: string,
  ) {
    data.quotes.push({
      id: randomUUID(),
      customerId: c.id,
      description,
      total,
      status: "aprovado",
      sentAt: at(offset - 4, "10:00"),
      respondedAt: at(offset - 2, "16:00"),
    });
    const serviceId = randomUUID();
    data.services.push({
      id: serviceId,
      customerId: c.id,
      type,
      description,
      performedAt: at(offset, "15:00"),
      total,
      employeeId,
    });
    data.tasks.push({
      id: randomUUID(),
      customerId: c.id,
      type: "pos_venda",
      title: "Pós-venda",
      reason: "Perguntar se ficou tudo certo com o serviço",
      dueDate: day(offset + 7),
      status: "concluida",
      completedAt: at(offset + 7, "10:00"),
      serviceId,
      autoRule: "R2",
      source: "sistema",
    });
  }
  function refusedQuote(
    c: { id: string },
    offset: number,
    description: string,
    total: number,
    reason: string,
  ) {
    data.quotes.push({
      id: randomUUID(),
      customerId: c.id,
      description,
      total,
      status: "recusado",
      sentAt: at(offset - 3, "10:00"),
      respondedAt: at(offset, "17:00"),
      lossReason: reason,
    });
  }

  const eduardo = pastCustomer("Eduardo Lima");
  pastSale(eduardo, -12, "troca_pneus", "Troca de 4 pneus 205/55 R16", 1960, ze);
  pastSale(eduardo, -95, "alinhamento", "Alinhamento + balanceamento", 150, rafael);
  const gabriela = pastCustomer("Gabriela Moraes", { origin: "instagram" });
  pastSale(gabriela, -14, "alinhamento", "Alinhamento e balanceamento", 150, rafael);
  pastSale(gabriela, -70, "troca_pneus", "Troca de 2 pneus 185/65 R15", 780, ze);
  refusedQuote(gabriela, -30, "4 pneus run-flat 225/45 R18", 3600, "Achou caro");
  const henrique = pastCustomer("Henrique Castro (frota)", { origin: "indicacao" });
  pastSale(henrique, -25, "troca_pneus", "Troca de 6 pneus 275/80 R22.5 (caminhão)", 9600, ze);
  pastSale(henrique, -120, "troca_pneus", "Troca de 4 pneus 275/80 R22.5", 6400, ze);
  refusedQuote(henrique, -10, "8 pneus de tração para a frota", 12800, "Prazo de entrega");
  const isabela = pastCustomer("Isabela Prado", { origin: "google" });
  pastSale(isabela, -40, "reparo", "Reparo de furo", 40, ze);
  pastSale(isabela, -48, "balanceamento", "Balanceamento das 4 rodas", 80, rafael);
  const joao = pastCustomer("João Victor Melo");
  pastSale(joao, -60, "troca_pneus", "Troca de 4 pneus 195/55 R16", 1720, ze);
  pastSale(joao, -150, "rodizio", "Rodízio de pneus", 60, rafael);
  const larissa = pastCustomer("Larissa Teixeira", { origin: "balcao" });
  pastSale(larissa, -33, "troca_pneus", "Troca de 4 pneus 215/50 R17", 3280, ze);
  pastSale(larissa, -110, "alinhamento", "Alinhamento", 90, rafael);
  const marcelo = pastCustomer("Marcelo Antunes");
  pastSale(marcelo, -85, "troca_pneus", "Troca de 4 pneus 225/45 R18", 3960, ze);
  pastSale(marcelo, -140, "balanceamento", "Balanceamento das 4 rodas", 80, rafael);
  refusedQuote(
    pastCustomer("Natália Freitas", { stage: "perdido", lossReason: "Achou caro" }),
    -20,
    "4 pneus 205/60 R16",
    2100,
    "Achou caro",
  );
  refusedQuote(
    pastCustomer("Otávio Ramos", { stage: "perdido", lossReason: "Comprou em outra loja" }),
    -45,
    "4 pneus 185/60 R15",
    1840,
    "Comprou em outra loja",
  );
  // Começo do funil: quem só conversou até agora.
  for (const [name, stage, offset, summary] of [
    ["Pedro Henrique Dias", "novo_contato", -4, "Perguntou se a loja trabalha com pneus de moto."],
    ["Rita Souza", "novo_contato", -6, "Quer saber o preço do alinhamento."],
    ["Sérgio Matos", "novo_contato", -9, "Pediu o endereço e o horário de sábado."],
    ["Tânia Reis", "em_negociacao", -5, "Comparando preços de 4 pneus aro 15."],
    ["Ulisses Prado", "em_negociacao", -8, "Quer parcelar 4 pneus aro 17; ficou de pensar."],
  ] as const) {
    const lead = pastCustomer(name, { stage, createdAt: at(offset, "09:00") });
    interaction(lead.id, offset, summary, { source: "gestor" });
  }

  // ---------- Fila de revisão ----------

  // Alto impacto: aprovação de orçamento sempre passa pelo gestor (D6).
  const approvalEvent = agentEvent({
    type: "quote.status_changed",
    status: "em_revisao",
    confidence: 0.91,
    evidence: "Cliente: pode fechar então os 2 pneus, passo aí sábado",
    conversation: "conv-fernanda",
    receivedOffset: 0,
    customer: { phone: fernanda.phoneDisplay!, name: fernanda.name },
    data: { status: "aprovado", quote_id: fernandaQuote },
    customerId: fernanda.id,
  });
  data.reviewItems.push({
    id: randomUUID(),
    agentEventId: approvalEvent,
    reason: "alto_impacto",
    proposed: {
      type: "quote.status_changed",
      data: { status: "aprovado", quote_id: fernandaQuote },
      customerId: fernanda.id,
      quoteId: fernandaQuote,
    },
  });

  // Baixa confiança e número desconhecido.
  const unknownEvent = agentEvent({
    type: "interaction.logged",
    status: "em_revisao",
    confidence: 0.42,
    evidence: "vcs tem aro 15?",
    conversation: "conv-desconhecido",
    receivedOffset: 0,
    customer: { phone: "(19) 90000-0099" },
    data: { summary: "Perguntou se a loja tem pneus aro 15", channel: "whatsapp" },
  });
  data.reviewItems.push({
    id: randomUUID(),
    agentEventId: unknownEvent,
    reason: "baixa_confianca",
    proposed: {
      type: "interaction.logged",
      data: { summary: "Perguntou se a loja tem pneus aro 15", channel: "whatsapp" },
      customer: { phone: "(19) 90000-0099" },
      customerId: null,
    },
  });

  // Conflito: o gestor corrigiu a cidade do Marcos; o agente sugere outra.
  const conflictEvent = agentEvent({
    type: "customer.upserted",
    status: "em_revisao",
    confidence: 0.87,
    evidence: "Cliente: a entrega é aqui em Hortolândia mesmo",
    conversation: "conv-marcos",
    receivedOffset: -1,
    customer: { phone: marcos.phoneDisplay!, name: marcos.name },
    data: { city: "Hortolândia" },
    customerId: marcos.id,
  });
  data.reviewItems.push({
    id: randomUUID(),
    agentEventId: conflictEvent,
    reason: "conflito_edicao_humana",
    proposed: {
      type: "customer.upserted",
      data: { city: "Hortolândia" },
      customerId: marcos.id,
      conflicts: ["city"],
      current: { city: "Sumaré" },
    },
  });

  return data;
}
