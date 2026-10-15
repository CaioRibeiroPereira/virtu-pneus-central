// Linha do tempo unificada da ficha do cliente (§9): atendimentos, orçamentos, serviços,
// agendamentos, ações concluídas e sugestões do Vito, mais recente primeiro.
// Função pura: recebe as linhas do banco e devolve os itens prontos para exibir.
import {
  appointmentStatusLabel,
  channelLabel,
  formatMoney,
  quoteStatusLabel,
  reviewReasonLabel,
  serviceTypeLabel,
} from "@/lib/labels";

export type TimelineKind =
  "atendimento" | "orcamento" | "servico" | "agendamento" | "tarefa" | "vito";

export const TIMELINE_KINDS: [TimelineKind, string][] = [
  ["atendimento", "Atendimentos"],
  ["orcamento", "Orçamentos"],
  ["servico", "Serviços"],
  ["agendamento", "Agendamentos"],
  ["tarefa", "Ações concluídas"],
  ["vito", "Sugestões do Vito"],
];

export type TimelineItem = {
  key: string;
  kind: TimelineKind;
  at: Date;
  title: string;
  detail?: string;
  viaAgent: boolean;
  evidence?: string | null;
  upcoming?: boolean;
};

type Src = { source: string; agentEventId: string | null };

export type TimelineInput = {
  now: Date;
  interactions: (Src & {
    id: string;
    channel: string;
    occurredAt: Date;
    summary: string;
    evidence: string | null;
  })[];
  quotes: (Src & {
    id: string;
    description: string;
    total: number;
    status: string;
    sentAt: Date | null;
    respondedAt: Date | null;
    createdAt: Date;
    lossReason: string | null;
  })[];
  services: (Src & {
    id: string;
    type: string;
    description: string;
    performedAt: Date;
    total: number | null;
  })[];
  appointments: (Src & { id: string; serviceType: string; status: string; scheduledAt: Date })[];
  completedTasks: (Src & { id: string; title: string; completedAt: Date | null })[];
  pendingSuggestions: {
    id: string;
    type: string;
    receivedAt: Date;
    evidence: string | null;
    reason: string;
  }[];
  /** Decisões do gestor na fila de revisão (aprovou, corrigiu ou rejeitou). */
  decidedSuggestions?: {
    id: string;
    status: string;
    decidedAt: Date | null;
    note: string | null;
  }[];
  /** Evidência de cada evento do agente, para mostrar junto do item que ele criou. */
  evidenceByEvent: Map<string, string | null>;
};

export function buildTimeline(input: TimelineInput): TimelineItem[] {
  const ev = (s: Src) =>
    s.agentEventId ? (input.evidenceByEvent.get(s.agentEventId) ?? null) : null;
  const items: TimelineItem[] = [];

  for (const i of input.interactions) {
    items.push({
      key: `i-${i.id}`,
      kind: "atendimento",
      at: i.occurredAt,
      title: `Atendimento · ${channelLabel[i.channel] ?? i.channel}`,
      detail: i.summary,
      viaAgent: i.source === "agente",
      evidence: i.evidence ?? ev(i),
    });
  }
  for (const q of input.quotes) {
    items.push({
      key: `q-${q.id}`,
      kind: "orcamento",
      at: q.sentAt ?? q.createdAt,
      title: `Orçamento de ${formatMoney(q.total)}`,
      detail: `${q.description} · ${quoteStatusLabel[q.status] ?? q.status}`,
      viaAgent: q.source === "agente",
      evidence: ev(q),
    });
    if (q.respondedAt && (q.status === "aprovado" || q.status === "recusado")) {
      items.push({
        key: `qr-${q.id}`,
        kind: "orcamento",
        at: q.respondedAt,
        title: q.status === "aprovado" ? "Orçamento aprovado" : "Orçamento recusado",
        detail: q.status === "recusado" && q.lossReason ? `Motivo: ${q.lossReason}` : q.description,
        viaAgent: false,
      });
    }
  }
  for (const s of input.services) {
    items.push({
      key: `s-${s.id}`,
      kind: "servico",
      at: s.performedAt,
      title: serviceTypeLabel[s.type] ?? "Serviço",
      detail: s.total != null ? `${s.description} · ${formatMoney(s.total)}` : s.description,
      viaAgent: s.source === "agente",
      evidence: ev(s),
    });
  }
  for (const a of input.appointments) {
    const upcoming = a.scheduledAt > input.now;
    items.push({
      key: `a-${a.id}`,
      kind: "agendamento",
      at: a.scheduledAt,
      title: `${upcoming ? "Agendado" : "Agendamento"}: ${serviceTypeLabel[a.serviceType] ?? "Serviço"}`,
      detail: appointmentStatusLabel[a.status] ?? a.status,
      viaAgent: a.source === "agente",
      evidence: ev(a),
      upcoming,
    });
  }
  for (const t of input.completedTasks) {
    if (!t.completedAt) continue;
    items.push({
      key: `t-${t.id}`,
      kind: "tarefa",
      at: t.completedAt,
      title: `Ação concluída: ${t.title}`,
      viaAgent: t.source === "agente",
    });
  }
  for (const p of input.pendingSuggestions) {
    items.push({
      key: `v-${p.id}`,
      kind: "vito",
      at: p.receivedAt,
      title: "Sugestão do Vito aguardando sua revisão",
      detail: reviewReasonLabel[p.reason] ?? p.reason,
      viaAgent: true,
      evidence: p.evidence,
    });
  }
  for (const d of input.decidedSuggestions ?? []) {
    if (!d.decidedAt) continue;
    const verb =
      d.status === "rejeitado"
        ? "rejeitada"
        : d.status === "aprovado_editado"
          ? "corrigida e aprovada"
          : "aprovada";
    items.push({
      key: `vd-${d.id}`,
      kind: "vito",
      at: d.decidedAt,
      title: `Sugestão do Vito ${verb} por você`,
      detail: d.note ?? undefined,
      viaAgent: false,
    });
  }

  return items.sort((a, b) => b.at.getTime() - a.at.getTime());
}
