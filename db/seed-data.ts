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
  };

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
