// Resumo diário (§8.5 e §12.2): o painel "Hoje" em JSON + uma mensagem curta e pronta, que o
// workflow do n8n entrega no Telegram às 7h45. O texto sai daqui (testável) e não do n8n.
// Minimização (LGPD): a mensagem leva nomes e o motivo, nunca telefone ou e-mail.
import { formatLongDate } from "@/lib/dates";
import type { TodayItem, TodayPanel } from "./today";

const MAX_LINES = 5; // por seção: o resumo precisa caber numa olhada no celular

/** Tarefa da regra R1 (orçamento enviado sem resposta). */
const isStaleQuote = (i: TodayItem) => i.kind === "task" && i.type === "followup_orcamento";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function line(i: TodayItem): string {
  if (i.kind === "appointment") return `${i.time} ${i.customerName} — ${i.title}`;
  const late = i.daysOverdue > 0 ? ` (há ${plural(i.daysOverdue, "dia", "dias")})` : "";
  return `${i.customerName} — ${i.title}${late}`;
}

function section(title: string, items: TodayItem[]): string[] {
  if (!items.length) return [];
  const shown = items.slice(0, MAX_LINES).map((i) => `• ${line(i)}`);
  const rest = items.length - shown.length;
  return [title, ...shown, ...(rest > 0 ? [`• e mais ${rest}`] : []), ""];
}

export function buildDigestMessage(panel: TodayPanel, appUrl: string): string {
  const header = `Bom dia! ${formatLongDate(panel.today)}.`;
  if (panel.allClear) {
    return `${header}\n\nTudo em dia: nenhuma ação atrasada ou para hoje. ✅\n\n${appUrl}/hoje`;
  }
  const appointments = panel.dueToday.filter((i) => i.kind === "appointment");
  const todayTasks = panel.dueToday.filter((i) => i.kind === "task");
  const stale = [...panel.overdue, ...todayTasks].filter(isStaleQuote).length;
  const counts = [
    panel.overdue.length && plural(panel.overdue.length, "atrasado", "atrasados"),
    todayTasks.length && plural(todayTasks.length, "ação para hoje", "ações para hoje"),
    appointments.length && plural(appointments.length, "agendamento", "agendamentos"),
    stale && plural(stale, "orçamento parado", "orçamentos parados"),
    panel.pendingReviews &&
      plural(
        panel.pendingReviews,
        "sugestão do Vito para revisar",
        "sugestões do Vito para revisar",
      ),
  ].filter(Boolean);
  return [
    header,
    `${counts.join(" · ")}.`,
    "",
    ...section("⏰ Atrasados", panel.overdue),
    ...section("📅 Agenda de hoje", appointments),
    ...section("✅ Para hoje", todayTasks),
    `Abrir o painel: ${appUrl}/hoje`,
  ].join("\n");
}

function itemJson(i: TodayItem) {
  return i.kind === "task"
    ? {
        tipo: "tarefa",
        tipo_tarefa: i.type,
        cliente: i.customerName,
        titulo: i.title,
        motivo: i.reason,
        dias_atraso: i.daysOverdue,
      }
    : { tipo: "agendamento", cliente: i.customerName, titulo: i.title, horario: i.time };
}

/** Corpo do GET /api/agenda/hoje. */
export function buildDigest(panel: TodayPanel, appUrl: string) {
  const todayTasks = panel.dueToday.filter((i) => i.kind === "task");
  return {
    data: panel.today,
    contagens: {
      revisao_pendente: panel.pendingReviews,
      atrasados: panel.overdue.length,
      hoje: panel.dueToday.length,
      agendamentos_hoje: panel.dueToday.length - todayTasks.length,
      orcamentos_parados: [...panel.overdue, ...todayTasks].filter(isStaleQuote).length,
      proximos_7_dias: panel.upcoming.length,
    },
    atrasados: panel.overdue.map(itemJson),
    hoje: panel.dueToday.map(itemJson),
    mensagem: buildDigestMessage(panel, appUrl),
  };
}
