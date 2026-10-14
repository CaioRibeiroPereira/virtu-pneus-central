import { withTransactionalDb } from "@/db";
import { bearerMatches } from "@/lib/auth/token";
import { todayInStore } from "@/lib/dates";
import { loadTodayPanel } from "@/lib/rules/today";

// Resumo do painel "Hoje" para o workflow de resumo diário do n8n (§8.5). Mesmo token dos agentes.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!bearerMatches(request.headers.get("authorization"), process.env.AGENT_API_TOKEN)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const panel = await withTransactionalDb((db) => loadTodayPanel(db, todayInStore()));
  const item = (i: (typeof panel.dueToday)[number]) =>
    i.kind === "task"
      ? {
          tipo: "tarefa",
          cliente: i.customerName,
          titulo: i.title,
          motivo: i.reason,
          dias_atraso: i.daysOverdue,
        }
      : { tipo: "agendamento", cliente: i.customerName, titulo: i.title, horario: i.time };
  return Response.json({
    data: panel.today,
    contagens: {
      revisao_pendente: panel.pendingReviews,
      atrasados: panel.overdue.length,
      hoje: panel.dueToday.length,
      proximos_7_dias: panel.upcoming.length,
    },
    atrasados: panel.overdue.map(item),
    hoje: panel.dueToday.map(item),
  });
}
