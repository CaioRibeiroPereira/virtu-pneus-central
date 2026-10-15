import { afterEach, describe, expect, it, vi } from "vitest";
import { publicAppUrl, trustedAppUrl } from "@/lib/app-url";
import { buildDigest, buildDigestMessage } from "@/lib/rules/digest";
import { assembleToday, type TodayAppointment, type TodayTask } from "@/lib/rules/today";

const TODAY = "2026-10-15"; // quinta-feira
const URL = "https://virtu.example";

let n = 0;
function task(overrides: Partial<TodayTask>): TodayTask {
  n += 1;
  return {
    kind: "task",
    id: `t${n}`,
    customerId: `c${n}`,
    customerName: `Cliente ${n}`,
    phoneE164: "+5519988887777",
    type: "pos_venda",
    title: "Pós-venda",
    reason: "Perguntar se ficou tudo certo",
    dueDate: TODAY,
    viaAgent: false,
    ...overrides,
  };
}
const appointment: TodayAppointment = {
  kind: "appointment",
  id: "a1",
  customerId: "c-a",
  customerName: "Daniel Souza",
  phoneE164: "+5519911112222",
  title: "Rodízio",
  status: "confirmado",
  scheduledAt: new Date("2026-10-15T14:30:00Z"),
  time: "11:30",
  viaAgent: false,
};

describe("mensagem do resumo diário", () => {
  it("dia sem pendências: mensagem curta de tudo em dia", () => {
    const panel = assembleToday({ today: TODAY, tasks: [], appointments: [], pendingReviews: 0 });
    expect(buildDigestMessage(panel, URL)).toBe(
      `Bom dia! Quinta-feira, 15 de outubro.\n\nTudo em dia: nenhuma ação atrasada ou para hoje. ✅\n\n${URL}/hoje`,
    );
  });

  it("conta atrasados, ações, agendamentos, orçamentos parados e revisão, com plural certo", () => {
    const panel = assembleToday({
      today: TODAY,
      pendingReviews: 1,
      appointments: [appointment],
      tasks: [
        task({ customerName: "Beatriz Rocha", dueDate: "2026-10-10", title: "Retorno comercial" }),
        task({
          customerName: "Ricardo Alves",
          dueDate: "2026-10-13",
          type: "followup_orcamento",
          title: "Retomar orçamento",
        }),
        task({ customerName: "Juliana Santos" }),
      ],
    });
    const text = buildDigestMessage(panel, URL);
    expect(text).toContain(
      "2 atrasados · 1 ação para hoje · 1 agendamento · 1 orçamento parado · 1 sugestão do Vito para revisar.",
    );
    expect(text).toContain("• Beatriz Rocha — Retorno comercial (há 5 dias)"); // mais antigo primeiro
    expect(text).toContain("• 11:30 Daniel Souza — Rodízio");
    expect(text).toContain(`Abrir o painel: ${URL}/hoje`);
  });

  it("não leva telefone nem e-mail (minimização, LGPD)", () => {
    const panel = assembleToday({
      today: TODAY,
      pendingReviews: 0,
      appointments: [appointment],
      tasks: [task({ dueDate: "2026-10-01" })],
    });
    const text = buildDigestMessage(panel, URL);
    expect(text).not.toMatch(/\+55|9888|9111|@/);
  });

  it("mostra no máximo 5 itens por seção e resume o resto", () => {
    const tasks = Array.from({ length: 8 }, (_, i) => task({ dueDate: `2026-10-0${i + 1}` }));
    const text = buildDigestMessage(
      assembleToday({ today: TODAY, tasks, appointments: [], pendingReviews: 0 }),
      URL,
    );
    expect(text.match(/^• Cliente/gm)).toHaveLength(5);
    expect(text).toContain("• e mais 3");
  });
});

describe("corpo do GET /api/agenda/hoje", () => {
  it("traz contagens, itens e a mensagem", () => {
    const panel = assembleToday({
      today: TODAY,
      pendingReviews: 2,
      appointments: [appointment],
      tasks: [task({ type: "followup_orcamento", dueDate: "2026-10-14" })],
    });
    const body = buildDigest(panel, URL);
    expect(body.contagens).toEqual({
      revisao_pendente: 2,
      atrasados: 1,
      hoje: 1,
      agendamentos_hoje: 1,
      orcamentos_parados: 1,
      proximos_7_dias: 0,
    });
    expect(body.hoje[0]).toEqual({
      tipo: "agendamento",
      cliente: "Daniel Souza",
      titulo: "Rodízio",
      horario: "11:30",
    });
    expect(body.mensagem).toContain("Bom dia!");
  });
});

describe("URL do sistema (D38: nunca do cabeçalho Host)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("produção usa o domínio informado pela Vercel; preview não chama a si mesmo", () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "virtu.vercel.app");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(trustedAppUrl()).toBe("https://virtu.vercel.app");
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(trustedAppUrl()).toBeNull();
    expect(publicAppUrl()).toBe("https://virtu.vercel.app"); // link em mensagem pode apontar à produção
  });

  it("fora da Vercel, localhost", () => {
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
    vi.stubEnv("PORT", "4000");
    expect(trustedAppUrl()).toBe("http://localhost:4000");
    expect(publicAppUrl()).toBe("http://localhost:4000");
  });
});
