import type { Metadata } from "next";
import { todayInStore } from "@/lib/dates";
import { buildPresetEvents, PRESETS } from "@/lib/simulator/presets";
import { Simulator } from "@/components/simulator";

export const metadata: Metadata = { title: "Simulador | Central de clientes" };
export const dynamic = "force-dynamic";

export default function SimuladorPage() {
  const today = todayInStore();
  const presets = PRESETS.map((p) => ({
    id: p.id,
    title: p.title,
    expected: p.expected,
    phone: p.phone,
    messages: p.messages,
    events: buildPresetEvents(p.id, today),
  }));
  const example = JSON.stringify(
    {
      ...buildPresetEvents("reclamacao-pos-troca", today)[0],
      event_id: `manual-exemplo-${today}`,
      data: { summary: "Perguntou o horário de funcionamento no sábado.", channel: "whatsapp" },
    },
    null,
    2,
  );

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Simulador do Vito</h1>
          <p className="muted" style={{ marginTop: 4, maxWidth: 720 }}>
            Conversas fictícias de WhatsApp e os eventos que o agente de IA extrai delas. Em
            produção, quem envia esses eventos é o n8n (conversa → IA → JSON); aqui você dispara o
            mesmo caminho e vê o resultado: aplicado sozinho, enviado para a sua revisão ou ignorado
            por ser repetido.
          </p>
        </div>
      </div>
      <Simulator presets={presets} exampleJson={example} />
    </>
  );
}
