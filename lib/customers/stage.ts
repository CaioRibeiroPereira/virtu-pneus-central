// A etapa do funil acompanha os fatos (D60). Orçamento enviado, agendamento e serviço feito levam
// o cliente adiante — nunca para trás: quem já é "Cliente" continua cliente ao pedir outro
// orçamento. "Perdido" volta ao funil quando a pessoa pede orçamento, agenda ou compra de novo (o
// motivo da perda fica guardado na auditoria). Recusa de orçamento não muda a etapa: declarar o
// cliente perdido, com o motivo, é decisão do gestor.
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { auditLog, customers } from "@/db/schema";

export type Stage = (typeof customers.$inferSelect)["stage"];

const FUNNEL: Stage[] = [
  "novo_contato",
  "em_negociacao",
  "orcamento_enviado",
  "agendado",
  "cliente",
];

/** Etapa depois de um fato que leva a `target` (null = não muda). Função pura. */
export function nextStage(current: Stage, target: Stage): Stage | null {
  if (current === target) return null;
  if (current === "perdido") return target;
  return FUNNEL.indexOf(target) > FUNNEL.indexOf(current) ? target : null;
}

/**
 * Avança a etapa do cliente, na transação de quem chama. Muda a `version` (quem estiver editando
 * o cadastro em outra tela recebe o aviso de conflito) e grava a auditoria como "sistema".
 */
export async function advanceStage(
  tx: Db,
  customerId: string,
  target: Stage,
  agentEventId?: string,
) {
  const [current] = await tx
    .select({
      stage: customers.stage,
      version: customers.version,
      lossReason: customers.lossReason,
    })
    .from(customers)
    .where(eq(customers.id, customerId));
  if (!current) return null;
  const to = nextStage(current.stage, target);
  if (!to) return null;
  await tx
    .update(customers)
    .set({ stage: to, lossReason: null, version: current.version + 1 })
    .where(eq(customers.id, customerId));
  await tx.insert(auditLog).values({
    entityType: "customer",
    entityId: customerId,
    action: "update",
    actorType: "sistema",
    agentEventId: agentEventId ?? null,
    before: {
      stage: current.stage,
      ...(current.lossReason ? { lossReason: current.lossReason } : {}),
    },
    after: { stage: to, motivo: "a etapa acompanha os fatos" },
  });
  return to;
}
