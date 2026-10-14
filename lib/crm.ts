export const uid = () =>
  typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
        b.toString(16).padStart(2, "0"),
      ).join("");
export const stages = [
  "Novo lead",
  "Em atendimento",
  "Orçamento enviado",
  "Agendado",
  "Concluído",
  "Perdido",
];
export const money = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export type Client = {
  id: string;
  revision: number;
  name: string;
  phone: string;
  email: string;
  city: string;
  vehicle: string;
  year: string;
  plate: string;
  measure: string;
  brand: string;
  quantity: number;
  origin: string;
  stage: string;
  owner: string;
  interest: string;
  quote: number;
  created: string;
  loss: string;
  notes: string;
  human: boolean;
  messages: { role: string; text: string; at: string }[];
  appointments: { id: string; at: string; service: string; status: string }[];
  services: { id: string; at: string; name: string; value: number; status: string }[];
  tasks: { id: string; at: string; text: string; done: boolean }[];
  history: { at: string; text: string }[];
};
export const day = (offset = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
};
export function blank(): Client {
  return {
    id: uid(),
    revision: 0,
    name: "",
    phone: "",
    email: "",
    city: "Campinas",
    vehicle: "",
    year: "",
    plate: "",
    measure: "",
    brand: "XBRI",
    quantity: 2,
    origin: "WhatsApp",
    stage: stages[0],
    owner: "Marina",
    interest: "Troca de pneus",
    quote: 0,
    created: day(),
    loss: "",
    notes: "",
    human: false,
    messages: [],
    appointments: [],
    services: [],
    tasks: [],
    history: [],
  };
}
export function seed(): Client[] {
  const rows = [
    ["Carolina Mendes", "Jeep Compass", "225/55 R18", 3, 2396, "Instagram"],
    ["Ricardo Almeida", "Honda Civic", "215/50 R17", 2, 1796, "Google"],
    ["Fernanda Costa", "Hyundai HB20", "185/60 R15", 1, 898, "WhatsApp"],
    ["Marcos Oliveira", "Volvo FH 540", "295/80 R22.5", 2, 7800, "Indicação"],
    ["Juliana Santos", "Volkswagen Polo", "195/55 R16", 4, 1598, "Google"],
    ["Eduardo Lima", "Toyota Corolla", "205/55 R16", 0, 0, "Instagram"],
    ["Beatriz Rocha", "Renault Duster", "215/65 R16", 3, 2196, "WhatsApp"],
    ["André Martins", "Chevrolet Onix", "185/65 R15", 5, 1098, "Google"],
    ["Patrícia Gomes", "Fiat Argo", "185/60 R15", 4, 998, "Indicação"],
    ["Lucas Ribeiro", "BMW 320i", "225/45 R18", 1, 0, "Instagram"],
    ["Roberto Nunes", "Mercedes-Benz Atego", "275/80 R22.5", 3, 6800, "WhatsApp"],
    ["Camila Ferreira", "Nissan Kicks", "205/60 R16", 2, 1896, "Google"],
    ["Paulo Teixeira", "Ford Ka", "175/65 R14", 4, 798, "WhatsApp"],
    ["Ana Barbosa", "Peugeot 208", "195/55 R16", 0, 0, "Instagram"],
    ["Daniel Souza", "Fiat Toro", "225/65 R17", 2, 2596, "Indicação"],
    ["Sofia Dias", "Volkswagen T-Cross", "205/60 R16", 1, 0, "Google"],
  ];
  return rows.map((r, i) => {
    const c = blank();
    c.id = "demo-" + i;
    c.name = r[0] as string;
    c.vehicle = r[1] as string;
    c.measure = r[2] as string;
    c.stage = stages[r[3] as number];
    c.quote = r[4] as number;
    c.origin = r[5] as string;
    c.phone = "(19) 00000-" + String(1000 + i);
    c.email = "cliente" + (i + 1) + "@example.com";
    c.year = String(2020 + (i % 5));
    c.plate = "DEMO";
    c.owner = i % 3 === 0 ? "Guilherme" : i % 3 === 1 ? "Marina" : "Rafael";
    c.created = day(-i * 2);
    c.quantity = i === 3 ? 4 : 2;
    c.interest = i === 3 || i === 10 ? "Pneus para linha pesada" : "Pneus + alinhamento";
    c.notes = "Cadastro fictício para demonstração. Prefere contato pelo WhatsApp.";
    c.loss = c.stage === "Perdido" ? "Fora do orçamento" : "";
    c.messages = [
      {
        role: "client",
        text: "Olá! Estou procurando pneus para meu " + c.vehicle + ".",
        at: day() + "T08:30",
      },
      {
        role: "agent",
        text: "Bom dia! Sou o Vito, assistente virtual do Grupo Virtù Pneus. Como posso te chamar?",
        at: day() + "T08:31",
      },
      {
        role: "client",
        text:
          "Sou " + c.name.split(" ")[0] + ". A medida é " + c.measure + ". Preciso de dois pneus.",
        at: day() + "T08:32",
      },
      {
        role: "agent",
        text: c.quote
          ? "Obrigado, " +
            c.name.split(" ")[0] +
            "! Neste exemplo, o orçamento registrado é de " +
            money(c.quote) +
            ". Você prefere agendar de manhã ou à tarde?"
          : "Obrigado! Vou verificar as opções nessa medida para você.",
        at: day() + "T08:33",
      },
    ];
    if (c.stage === "Agendado")
      c.appointments = [
        {
          id: "a" + i,
          at: day(i === 6 ? 1 : 0) + "T" + (i === 0 ? "09:00" : i === 6 ? "14:00" : "11:30"),
          service: c.interest,
          status: "Confirmado",
        },
      ];
    if (c.stage === "Concluído") {
      c.services = [
        { id: "s" + i, at: day(-i), name: c.interest, value: c.quote, status: "Concluído" },
      ];
      c.appointments = [
        { id: "a" + i, at: day(-i) + "T10:00", service: c.interest, status: "Realizado" },
      ];
    }
    if (c.stage === "Perdido")
      c.appointments = [
        { id: "a" + i, at: day(-1) + "T15:00", service: c.interest, status: "Não compareceu" },
      ];
    if (i % 2 === 0)
      c.tasks = [
        {
          id: "t" + i,
          at: day(i === 2 ? -1 : i === 4 ? 7 : 0) + "T" + (i % 4 === 0 ? "10:30" : "16:00"),
          text:
            c.stage === "Concluído"
              ? "Pós-venda: confirmar satisfação"
              : "Retomar orçamento e confirmar interesse",
          done: false,
        },
      ];
    c.history = [
      { at: c.created + "T09:00", text: "Contato recebido via " + c.origin },
      { at: day() + "T08:33", text: "Etapa atual: " + c.stage },
    ];
    return c;
  });
}
