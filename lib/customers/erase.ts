// Exclusão de cliente a pedido do titular (LGPD, D64). Apaga o cadastro e tudo que guarda dado
// pessoal dele, numa transação:
//  - cadastro, veículos, orçamentos, serviços, agendamentos, próximas ações e atendimentos (cascade);
//  - eventos do Vito sobre ele (trazem telefone, nome e trechos da conversa) e as sugestões na Revisão;
//  - conversas do Telegram ligadas a ele ou ao telefone dele;
//  - as linhas da auditoria desses registros (o antes/depois tem nome, telefone, valores).
// Fica só uma linha de auditoria "delete" com o id e o motivo, sem dado pessoal (§6, plano).
// O estoque não volta: a mercadoria saiu de verdade; as movimentações ficam, sem o vínculo.
import { eq, inArray, isNull, or } from "drizzle-orm";
import type { Db } from "@/db";
import {
  agentEvents,
  appointments,
  auditLog,
  customers,
  interactions,
  quotes,
  services,
  tasks,
  telegramChats,
  vehicles,
} from "@/db/schema";
import { normalizePhone } from "@/lib/phone";
import { CommandError } from "./commands";

export async function eraseCustomer(db: Db, customerId: string) {
  return db.transaction(async (tx) => {
    const [customer] = await tx.select().from(customers).where(eq(customers.id, customerId));
    if (!customer) throw new CommandError("Cliente não encontrado.");

    const ids = async (
      table:
        | typeof vehicles
        | typeof quotes
        | typeof services
        | typeof appointments
        | typeof tasks
        | typeof interactions,
    ) =>
      (await tx.select({ id: table.id }).from(table).where(eq(table.customerId, customerId))).map(
        (r) => r.id,
      );
    const related = [
      customerId,
      ...(await ids(vehicles)),
      ...(await ids(quotes)),
      ...(await ids(services)),
      ...(await ids(appointments)),
      ...(await ids(tasks)),
      ...(await ids(interactions)),
    ];

    // Eventos do Vito: os ligados ao cliente e os ainda sem cliente com o telefone dele.
    const loose = await tx
      .select({ id: agentEvents.id, payload: agentEvents.payload })
      .from(agentEvents)
      .where(isNull(agentEvents.customerId));
    const samePhone = loose
      .filter((e) => {
        const phone = (e.payload as { customer?: { phone?: string } })?.customer?.phone;
        return (
          !!customer.phoneE164 && !!phone && normalizePhone(phone)?.e164 === customer.phoneE164
        );
      })
      .map((e) => e.id);
    const events = [
      ...(
        await tx
          .select({ id: agentEvents.id })
          .from(agentEvents)
          .where(eq(agentEvents.customerId, customerId))
      ).map((e) => e.id),
      ...samePhone,
    ];

    if (related.length) await tx.delete(auditLog).where(inArray(auditLog.entityId, related));
    if (events.length) {
      await tx.delete(auditLog).where(inArray(auditLog.agentEventId, events));
      // O cadastro aponta para o evento que o criou: solta antes de apagar os eventos.
      await tx.update(customers).set({ agentEventId: null }).where(eq(customers.id, customerId));
      await tx.delete(agentEvents).where(inArray(agentEvents.id, events)); // revisão: cascade
    }
    await tx
      .delete(telegramChats)
      .where(
        customer.phoneE164
          ? or(
              eq(telegramChats.customerId, customerId),
              eq(telegramChats.phoneE164, customer.phoneE164),
            )
          : eq(telegramChats.customerId, customerId),
      ); // mensagens: cascade
    await tx.delete(customers).where(eq(customers.id, customerId)); // o resto: cascade
    await tx.insert(auditLog).values({
      entityType: "customer",
      entityId: customerId,
      action: "delete",
      actorType: "gestor",
      after: { motivo: "exclusão a pedido do titular (LGPD)" },
    });
    return { removedEvents: events.length };
  });
}
