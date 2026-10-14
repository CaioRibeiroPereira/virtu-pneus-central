"use client";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Users,
  Kanban,
  MessageSquare,
  CalendarDays,
  Wrench,
  ListTodo,
  Search,
  Plus,
  ArrowUpRight,
  ArrowRight,
  Car,
  Clock,
  Check,
  Download,
  ChevronRight,
  Headphones,
  Send,
  CircleDollarSign,
  TrendingUp,
  Target,
  Menu,
  Loader2,
} from "lucide-react";
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableHeader,
  TableHead,
  TableRow,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { Toaster, toast } from "sonner";
import { Client, blank, stages, money, day, uid } from "@/lib/crm";
const nav = [
  ["Visão geral", LayoutDashboard],
  ["Clientes", Users],
  ["Funil de vendas", Kanban],
  ["Atendimentos", MessageSquare],
  ["Agenda", CalendarDays],
  ["Serviços", Wrench],
  ["Próximos contatos", ListTodo],
] as const;
const fmt = (d: string) =>
  d
    ? new Date(d.length === 10 ? d + "T12:00" : d).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "short",
      })
    : "—";
const time = (d: string) => d?.split("T")[1]?.slice(0, 5) || "";
function Pick({
  value,
  onChange,
  options,
  labels,
}: {
  value: string;
  onChange: (s: string) => void;
  options: string[];
  labels?: Record<string, string>;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="picker">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((s) => (
          <SelectItem key={s} value={s}>
            {labels?.[s] || s}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
function Badge({ value }: { value: string }) {
  return <span className={"badge b" + Math.max(0, stages.indexOf(value))}>{value}</span>;
}
function Avatar({ name }: { name: string }) {
  return (
    <span className="avatar">
      {name
        .split(" ")
        .slice(0, 2)
        .map((s) => s[0])
        .join("")}
    </span>
  );
}
export default function App() {
  const [clients, setClients] = useState<Client[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [page, setPage] = useState("Visão geral"),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("Todas as etapas"),
    [period, setPeriod] = useState("Últimos 30 dias"),
    [edit, setEdit] = useState<Client | null>(null),
    [busy, setBusy] = useState(false),
    [active, setActive] = useState("demo-0"),
    [message, setMessage] = useState(""),
    [date, setDate] = useState(day()),
    [taskFilter, setTaskFilter] = useState("Pendentes"),
    [form, setForm] = useState<{ kind: string; client: string } | null>(null),
    [drag, setDrag] = useState("");
  async function load() {
    setLoading(true);
    setError("");
    try {
      const r = await fetch("/api/crm");
      const d: any = await r.json();
      if (!r.ok) throw Error(d.error);
      setClients(d.clients);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);
  async function save(c: Client, notice = "Alteração salva") {
    if (busy) return false;
    setBusy(true);
    try {
      const r = await fetch("/api/crm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(c),
      });
      const d: any = await r.json();
      if (!r.ok) throw Error(d.error);
      setClients((cs) =>
        cs.some((x) => x.id === d.client.id)
          ? cs.map((x) => (x.id === d.client.id ? d.client : x))
          : [d.client, ...cs],
      );
      toast.success(notice);
      return true;
    } catch (e: any) {
      toast.error(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  function open(c: Client) {
    setEdit(structuredClone(c));
  }
  function go(p: string) {
    setPage(p);
    setSearch("");
    setFilter("Todas as etapas");
  }
  const visible = clients.filter(
    (c) =>
      [c.name, c.phone, c.vehicle, c.measure, c.owner]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (filter === "Todas as etapas" || c.stage === filter),
  );
  const from =
    period === "Últimos 7 dias" ? day(-6) : period === "Últimos 30 dias" ? day(-29) : "0000";
  const inPeriod = (d: string) => d.slice(0, 10) >= from && d.slice(0, 10) <= day();
  const cohort = clients.filter((c) => inPeriod(c.created));
  const appointments = clients
    .flatMap((c) => c.appointments.map((a) => ({ ...a, c })))
    .sort((a, b) => a.at.localeCompare(b.at));
  const tasks = clients
    .flatMap((c) => c.tasks.map((t) => ({ ...t, c })))
    .sort((a, b) => a.at.localeCompare(b.at));
  const services = clients
    .flatMap((c) => c.services.map((s) => ({ ...s, c })))
    .sort((a, b) => b.at.localeCompare(a.at));
  const received = services
    .filter((s) => s.status === "Concluído" && inPeriod(s.at))
    .reduce((n, s) => n + s.value, 0);
  const booked = cohort.filter((c) => c.appointments.some((a) => a.status !== "Cancelado")).length;
  const chat = clients.find((c) => c.id === active) || clients[0];
  function exportCsv() {
    const rows = [
      ["Nome", "Telefone", "Veículo", "Medida", "Etapa", "Responsável", "Orçamento"],
      ...visible.map((c) => [c.name, c.phone, c.vehicle, c.measure, c.stage, c.owner, c.quote]),
    ];
    const csv =
      "\uFEFF" +
      rows
        .map((r) =>
          r
            .map(
              (v) =>
                '"' +
                String(v)
                  .replace(/^[=+@-]/, "'")
                  .replaceAll('"', '""') +
                '"',
            )
            .join(";"),
        )
        .join("\n");
    const u = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = u;
    a.download = "clientes-virtu-demo.csv";
    a.click();
    URL.revokeObjectURL(u);
  }
  async function changeStage(c: Client, stage: string) {
    if (stage === "Perdido") {
      open({ ...c, stage });
      return;
    }
    await save({
      ...c,
      stage,
      history: [
        ...c.history,
        { at: new Date().toISOString(), text: "Etapa alterada para " + stage },
      ],
    });
  }
  const field = (key: keyof Client, label: string, type = "text") => (
    <label className="field">
      {label}
      <input
        type={type}
        value={String(edit?.[key] ?? "")}
        min={type === "number" ? 0 : undefined}
        onChange={(e) =>
          setEdit({ ...edit!, [key]: type === "number" ? Number(e.target.value) : e.target.value })
        }
      />
    </label>
  );
  return (
    <SidebarProvider>
      <Sidebar className="brand-sidebar">
        <SidebarHeader>
          <div className="brand">
            virtù<span>.</span>
            <small>GRUPO VIRTÙ PNEUS</small>
          </div>
          <div className="workspace">
            PV{" "}
            <div>
              Autocenter Campinas<small>Central de relacionamento</small>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <p className="nav-label">GESTÃO DA LOJA</p>
          <SidebarMenu>
            {nav.map(([title, Icon]) => (
              <SidebarMenuItem key={title}>
                <SidebarMenuButton
                  isActive={page === title}
                  onClick={() => go(title)}
                  className="nav-btn"
                >
                  <Icon />
                  <span>{title}</span>
                  {title === "Próximos contatos" && (
                    <em>{tasks.filter((t) => !t.done && t.at.slice(0, 10) <= day()).length}</em>
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
          <div className="demo-side">
            <span className="mini-label">AMBIENTE DEMONSTRATIVO</span>
            <p>
              Sua operação.
              <br />
              Mais perto do cliente.
            </p>
            <small>Dados fictícios · alterações salvas</small>
          </div>
        </SidebarContent>
        <SidebarFooter>
          <div className="profile">
            <span>GC</span>
            <div>
              Guilherme<small>Gestor da loja</small>
            </div>
            <ChevronRight size={16} />
          </div>
        </SidebarFooter>
      </Sidebar>
      <main className="main">
        <header className="topbar">
          <div>
            <SidebarTrigger />
            <span>Central de atendimento</span>
            <ChevronRight size={14} />
            <b>{page}</b>
          </div>
          <span className="demo-pill">Demonstração</span>
        </header>
        <div className="content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">GRUPO VIRTÙ PNEUS / CAMPINAS</p>
              <h1>{page === "Visão geral" ? "Sua loja, em movimento." : page}</h1>
              <p className="sub">
                {page === "Visão geral"
                  ? "Acompanhe cada conversa. Enxergue a próxima oportunidade."
                  : page === "Atendimentos"
                    ? "Histórico do Vito e acompanhamento da equipe."
                    : page === "Funil de vendas"
                      ? "Da primeira mensagem ao próximo serviço."
                      : page === "Próximos contatos"
                        ? "Relacionamento continua depois da venda."
                        : "Tudo o que sua equipe precisa para continuar o atendimento."}
              </p>
            </div>
            <div className="heading-actions">
              {page === "Visão geral" ? (
                <Pick
                  value={period}
                  onChange={setPeriod}
                  options={["Últimos 7 dias", "Últimos 30 dias", "Todo o período"]}
                />
              ) : null}
              <button
                className="primary"
                onClick={() =>
                  page === "Agenda" || page === "Serviços" || page === "Próximos contatos"
                    ? setForm({ kind: page, client: clients[0]?.id || "" })
                    : setEdit(blank())
                }
              >
                <Plus size={17} />
                {page === "Agenda"
                  ? "Agendar serviço"
                  : page === "Serviços"
                    ? "Registrar serviço"
                    : page === "Próximos contatos"
                      ? "Novo contato futuro"
                      : "Novo cliente"}
              </button>
            </div>
          </div>
          {loading ? (
            <div className="empty">
              <Loader2 className="spin" />
              Carregando sua central...
            </div>
          ) : error ? (
            <div className="empty">
              <h3>Não foi possível abrir a central</h3>
              <p>{error}</p>
              <button onClick={load}>Tentar novamente</button>
            </div>
          ) : (
            <>
              {page === "Visão geral" && (
                <>
                  <div className="metric-grid">
                    <Metric
                      label="Total de clientes"
                      value={clients.length}
                      detail={`${cohort.length} novos no período`}
                      icon={<Users />}
                    />
                    <Metric
                      label="Conversão em agenda"
                      value={`${cohort.length ? Math.round((booked / cohort.length) * 100) : 0}%`}
                      detail={`${booked} de ${cohort.length} novos clientes agendaram`}
                      icon={<Target />}
                    />
                    <Metric
                      label="Serviços concluídos"
                      value={
                        services.filter((s) => s.status === "Concluído" && inPeriod(s.at)).length
                      }
                      detail="Serviços realizados no período"
                      icon={<Wrench />}
                    />
                    <Metric
                      label="Receita de serviços"
                      value={money(received)}
                      detail="Valores de serviços concluídos"
                      icon={<CircleDollarSign />}
                      accent
                    />
                  </div>
                  <div className="overview-grid">
                    <section className="panel trend">
                      <div className="panel-head">
                        <div>
                          <h2>Novos contatos</h2>
                          <p>Primeiro atendimento por semana</p>
                        </div>
                        <span className="legend">
                          <i />
                          Clientes
                        </span>
                      </div>
                      <div className="chart">
                        {Array.from({ length: period === "Últimos 7 dias" ? 1 : 5 }, (_, i) => {
                          const offset = period === "Últimos 7 dias" ? 0 : 4 - i;
                          const start = day(-offset * 7 - 6),
                            end = day(-offset * 7);
                          const count = cohort.filter(
                            (c) => c.created >= start && c.created <= end,
                          ).length;
                          return (
                            <div className="bar-col" key={i}>
                              <b>{count}</b>
                              <div className="bar" style={{ height: Math.max(4, count * 23) }} />
                              <span>
                                {fmt(start)} — {fmt(end)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                      <div className="chart-foot">
                        <span>Origem dos novos clientes</span>
                        <div>
                          {["Google", "Instagram", "WhatsApp", "Indicação"].map((o) => (
                            <span key={o}>
                              {o} <b>{cohort.filter((c) => c.origin === o).length}</b>
                            </span>
                          ))}
                        </div>
                      </div>
                    </section>
                    <section className="panel funnel-mini">
                      <div className="panel-head">
                        <div>
                          <h2>Funil em tempo real</h2>
                          <p>Todos os clientes por etapa</p>
                        </div>
                        <button
                          className="icon-btn"
                          aria-label="Abrir funil"
                          onClick={() => go("Funil de vendas")}
                        >
                          <ArrowUpRight />
                        </button>
                      </div>
                      {stages.map((s, i) => (
                        <button
                          className="funnel-row"
                          key={s}
                          onClick={() => {
                            go("Clientes");
                            setFilter(s);
                          }}
                        >
                          <span>
                            <i className={"stage-dot dot" + i} />
                            {s}
                          </span>
                          <div
                            style={{
                              width: `${Math.max(4, clients.filter((c) => c.stage === s).length * 15)}%`,
                            }}
                          />
                          <b>{clients.filter((c) => c.stage === s).length}</b>
                        </button>
                      ))}
                      <div className="funnel-total">
                        Em negociação{" "}
                        <strong>
                          {money(
                            clients
                              .filter((c) =>
                                ["Em atendimento", "Orçamento enviado"].includes(c.stage),
                              )
                              .reduce((n, c) => n + c.quote, 0),
                          )}
                        </strong>
                      </div>
                    </section>
                  </div>
                  <div className="overview-grid lower">
                    <section className="panel">
                      <div className="panel-head">
                        <div>
                          <h2>
                            Agenda de hoje{" "}
                            <span className="count">
                              {appointments.filter((a) => a.at.startsWith(day())).length}
                            </span>
                          </h2>
                          <p>
                            {new Date().toLocaleDateString("pt-BR", {
                              weekday: "long",
                              day: "numeric",
                              month: "long",
                            })}
                          </p>
                        </div>
                        <button className="text-btn" onClick={() => go("Agenda")}>
                          Ver agenda <ArrowRight size={16} />
                        </button>
                      </div>
                      {appointments.filter((a) => a.at.startsWith(day())).length ? (
                        appointments
                          .filter((a) => a.at.startsWith(day()))
                          .map((a) => (
                            <button className="agenda-row" key={a.id} onClick={() => open(a.c)}>
                              <span className="time">{time(a.at)}</span>
                              <Avatar name={a.c.name} />
                              <div>
                                <b>{a.c.name}</b>
                                <small>
                                  {a.c.vehicle} · {a.service}
                                </small>
                              </div>
                              <span className="status">{a.status}</span>
                            </button>
                          ))
                      ) : (
                        <Empty text="Nenhum agendamento para hoje." />
                      )}
                      <div className="small-stats">
                        <span>
                          Agendamentos no período{" "}
                          <b>{appointments.filter((a) => inPeriod(a.at)).length}</b>
                        </span>
                        <span>
                          Não compareceram{" "}
                          <b>
                            {
                              appointments.filter(
                                (a) => inPeriod(a.at) && a.status === "Não compareceu",
                              ).length
                            }
                          </b>
                        </span>
                      </div>
                    </section>
                    <section className="panel">
                      <div className="panel-head">
                        <div>
                          <h2>Precisam da sua atenção</h2>
                          <p>Retornos pendentes até hoje</p>
                        </div>
                        <span className="attention-count">
                          {tasks.filter((t) => !t.done && t.at.slice(0, 10) <= day()).length}
                        </span>
                      </div>
                      {tasks
                        .filter((t) => !t.done && t.at.slice(0, 10) <= day())
                        .slice(0, 3)
                        .map((t) => (
                          <div className="task-row" key={t.id}>
                            <button
                              className="check-btn"
                              disabled={busy}
                              aria-label={"Concluir retorno de " + t.c.name}
                              onClick={() =>
                                save(
                                  {
                                    ...t.c,
                                    tasks: t.c.tasks.map((x) =>
                                      x.id === t.id ? { ...x, done: true } : x,
                                    ),
                                  },
                                  "Retorno concluído",
                                )
                              }
                            >
                              <Check size={14} />
                            </button>
                            <button className="task-title" onClick={() => open(t.c)}>
                              <b>{t.c.name}</b>
                              <small>{t.text}</small>
                            </button>
                            <span className={t.at.slice(0, 10) < day() ? "overdue" : "muted"}>
                              {t.at.slice(0, 10) < day() ? "Atrasado" : time(t.at)}
                            </span>
                          </div>
                        ))}
                      <button className="all-tasks" onClick={() => go("Próximos contatos")}>
                        Organizar próximos contatos <ArrowRight size={16} />
                      </button>
                    </section>
                  </div>
                </>
              )}
              {["Clientes", "Funil de vendas"].includes(page) && (
                <div className="toolbar">
                  <div className="search">
                    <Search size={18} />
                    <input
                      placeholder="Buscar nome, telefone, veículo ou medida"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  {page === "Clientes" && (
                    <Pick
                      value={filter}
                      onChange={setFilter}
                      options={["Todas as etapas", ...stages]}
                    />
                  )}
                  <span>{visible.length} clientes</span>
                  <button onClick={exportCsv}>
                    <Download size={16} />
                    Exportar
                  </button>
                </div>
              )}
              {page === "Clientes" && (
                <section className="panel table-panel">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {[
                          "Cliente",
                          "Veículo / medida",
                          "Interesse",
                          "Etapa",
                          "Orçamento",
                          "Responsável",
                          "",
                        ].map((s, i) => (
                          <TableHead key={i}>{s}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visible.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell>
                            <button className="person" onClick={() => open(c)}>
                              <Avatar name={c.name} />
                              <span>
                                <b>{c.name}</b>
                                <small>{c.phone}</small>
                              </span>
                            </button>
                          </TableCell>
                          <TableCell>
                            <b>{c.vehicle || "Não informado"}</b>
                            <small>{c.measure || "Medida a confirmar"}</small>
                          </TableCell>
                          <TableCell>{c.interest}</TableCell>
                          <TableCell>
                            <Badge value={c.stage} />
                          </TableCell>
                          <TableCell>{c.quote ? money(c.quote) : "A definir"}</TableCell>
                          <TableCell>{c.owner}</TableCell>
                          <TableCell>
                            <button
                              className="icon-btn"
                              aria-label={"Editar " + c.name}
                              onClick={() => open(c)}
                            >
                              <ChevronRight size={18} />
                            </button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {!visible.length && (
                    <Empty text="Nenhum cliente encontrado. Ajuste a busca ou cadastre um novo cliente." />
                  )}
                </section>
              )}
              {page === "Funil de vendas" && (
                <>
                  <p className="hint">
                    Arraste os cards entre etapas ou abra uma ficha para alterar a etapa pelo
                    formulário.
                  </p>
                  <div className="kanban">
                    {stages.map((s, i) => (
                      <section
                        className={"kanban-col " + (drag ? "drop-ready" : "")}
                        key={s}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          const c = clients.find(
                            (c) => c.id === e.dataTransfer.getData("text/plain"),
                          );
                          setDrag("");
                          if (c && c.stage !== s) changeStage(c, s);
                        }}
                      >
                        <div className="kanban-head">
                          <span>
                            <i className={"stage-dot dot" + i} />
                            {s}
                          </span>
                          <b>{visible.filter((c) => c.stage === s).length}</b>
                        </div>
                        <p className="kanban-value">
                          {money(
                            visible.filter((c) => c.stage === s).reduce((n, c) => n + c.quote, 0),
                          )}
                        </p>
                        {visible
                          .filter((c) => c.stage === s)
                          .map((c) => (
                            <button
                              className="lead-card"
                              key={c.id}
                              draggable={!busy}
                              onDragStart={(e) => {
                                e.dataTransfer.setData("text/plain", c.id);
                                setDrag(c.id);
                              }}
                              onDragEnd={() => setDrag("")}
                              onClick={() => open(c)}
                            >
                              <span className="lead-origin">
                                {c.origin}
                                <span>···</span>
                              </span>
                              <h3>{c.name}</h3>
                              <p>
                                <Car size={14} />
                                {c.vehicle || "Veículo a confirmar"}
                              </p>
                              <p>{c.measure || "Medida a confirmar"}</p>
                              <div className="lead-bottom">
                                <strong>{c.quote ? money(c.quote) : "Sem orçamento"}</strong>
                                <span>{c.owner[0]}</span>
                              </div>
                              {c.tasks.some((t) => !t.done) && (
                                <small className="lead-task">
                                  <Clock size={12} /> Retorno pendente
                                </small>
                              )}
                            </button>
                          ))}
                      </section>
                    ))}
                  </div>
                </>
              )}
              {page === "Atendimentos" && (
                <div className="chat-layout panel">
                  <aside className="conversation-list">
                    <div className="search">
                      <Search size={17} />
                      <input
                        placeholder="Buscar conversa"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </div>
                    {visible.map((c) => (
                      <button
                        className={"conversation " + (chat?.id === c.id ? "selected" : "")}
                        key={c.id}
                        onClick={() => setActive(c.id)}
                      >
                        <Avatar name={c.name} />
                        <div>
                          <b>{c.name}</b>
                          <small>{c.messages.at(-1)?.text || "Sem mensagens"}</small>
                          <span>{c.human ? "Com a equipe" : "Atendimento Vito"}</span>
                        </div>
                      </button>
                    ))}
                  </aside>
                  {chat ? (
                    <section className="chat-main">
                      <header>
                        <Avatar name={chat.name} />
                        <div>
                          <b>{chat.name}</b>
                          <small>
                            {chat.vehicle} · {chat.measure}
                          </small>
                        </div>
                        <button onClick={() => open(chat)}>
                          Ver ficha <ArrowUpRight size={15} />
                        </button>
                      </header>
                      <div className="chat-banner">
                        <span>
                          <Headphones size={16} />
                          {chat.human
                            ? "Equipe responsável pelo atendimento"
                            : "Vito · Histórico de atendimento"}
                        </span>
                        <button
                          disabled={busy}
                          onClick={() =>
                            save(
                              { ...chat, human: !chat.human },
                              chat.human
                                ? "Atendimento atribuído ao Vito na demonstração"
                                : "Atendimento assumido na demonstração",
                            )
                          }
                        >
                          {chat.human ? "Devolver ao Vito" : "Assumir atendimento"}
                        </button>
                      </div>
                      <div className="messages">
                        <span className="chat-date">Conversa demonstrativa</span>
                        {chat.messages.map((m, i) => (
                          <div
                            className={"bubble " + (m.role === "client" ? "incoming" : "outgoing")}
                            key={i}
                          >
                            <small>
                              {m.role === "client"
                                ? chat.name.split(" ")[0]
                                : m.role === "agent"
                                  ? "Vito · Assistente virtual"
                                  : "Equipe · Simulação"}
                            </small>
                            <p>{m.text}</p>
                            <time>
                              {time(m.at) ||
                                new Date(m.at).toLocaleTimeString("pt-BR", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                            </time>
                          </div>
                        ))}
                      </div>
                      <form
                        className="composer"
                        onSubmit={async (e) => {
                          e.preventDefault();
                          if (!message.trim()) return;
                          if (
                            await save(
                              {
                                ...chat,
                                messages: [
                                  ...chat.messages,
                                  {
                                    role: "human",
                                    text: message.trim(),
                                    at:
                                      day() +
                                      "T" +
                                      new Date().toLocaleTimeString("pt-BR", {
                                        timeZone: "America/Sao_Paulo",
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      }),
                                  },
                                ],
                              },
                              "Mensagem registrada apenas na demonstração",
                            )
                          )
                            setMessage("");
                        }}
                      >
                        <input
                          aria-label="Mensagem simulada"
                          placeholder="Escreva uma mensagem de demonstração..."
                          value={message}
                          onChange={(e) => setMessage(e.target.value)}
                        />
                        <button
                          className="primary"
                          disabled={busy || !message.trim()}
                          aria-label="Registrar mensagem simulada"
                        >
                          <Send size={18} />
                        </button>
                      </form>
                      <p className="demo-note">
                        Simulação: nenhuma mensagem é enviada ao WhatsApp.
                      </p>
                    </section>
                  ) : (
                    <Empty text="Cadastre um cliente para iniciar." />
                  )}
                </div>
              )}
              {page === "Agenda" && (
                <>
                  <div className="toolbar">
                    <div className="date-control">
                      <CalendarDays size={18} />
                      <input
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        aria-label="Dia da agenda"
                      />
                    </div>
                    <button onClick={() => setDate(day())}>Hoje</button>
                    <span>
                      {appointments.filter((a) => a.at.startsWith(date)).length} agendamentos
                    </span>
                  </div>
                  <section className="panel schedule">
                    <div className="panel-head">
                      <h2>Agenda · {fmt(date)}</h2>
                      <span>Horário de Campinas</span>
                    </div>
                    {appointments
                      .filter((a) => a.at.startsWith(date))
                      .map((a) => (
                        <div className="schedule-row" key={a.id}>
                          <strong className="time">{time(a.at)}</strong>
                          <Avatar name={a.c.name} />
                          <button className="task-title" onClick={() => open(a.c)}>
                            <b>{a.c.name}</b>
                            <small>
                              {a.c.vehicle} · {a.service}
                            </small>
                          </button>
                          <Pick
                            value={a.status}
                            options={[
                              "Agendado",
                              "Confirmado",
                              "Realizado",
                              "Não compareceu",
                              "Cancelado",
                            ]}
                            onChange={(status) =>
                              save({
                                ...a.c,
                                appointments: a.c.appointments.map((x) =>
                                  x.id === a.id ? { ...x, status } : x,
                                ),
                              }).then(() => {})
                            }
                          />
                          <button
                            onClick={() =>
                              setForm({ kind: "Remarcar", client: a.c.id, id: a.id } as any)
                            }
                          >
                            Remarcar
                          </button>
                        </div>
                      ))}
                    {!appointments.some((a) => a.at.startsWith(date)) && (
                      <Empty text="Dia livre. Agende um serviço para preencher a agenda." />
                    )}
                  </section>
                </>
              )}
              {page === "Serviços" && (
                <>
                  <div className="metric-grid three">
                    <Metric
                      label="Receita registrada"
                      value={money(
                        services
                          .filter((s) => s.status === "Concluído")
                          .reduce((n, s) => n + s.value, 0),
                      )}
                      detail="Todos os serviços concluídos"
                      icon={<CircleDollarSign />}
                    />
                    <Metric
                      label="Ordens de serviço"
                      value={services.length}
                      detail="Todos os registros"
                      icon={<Wrench />}
                    />
                    <Metric
                      label="Em andamento"
                      value={services.filter((s) => s.status === "Em andamento").length}
                      detail="Serviços em execução"
                      icon={<Clock />}
                    />
                  </div>
                  <section className="panel table-panel">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {["Data", "Cliente / veículo", "Serviço", "Valor", "Situação"].map(
                            (s) => (
                              <TableHead key={s}>{s}</TableHead>
                            ),
                          )}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {services.map((s) => (
                          <TableRow key={s.id}>
                            <TableCell>{fmt(s.at)}</TableCell>
                            <TableCell>
                              <button className="task-title" onClick={() => open(s.c)}>
                                <b>{s.c.name}</b>
                                <small>{s.c.vehicle}</small>
                              </button>
                            </TableCell>
                            <TableCell>{s.name}</TableCell>
                            <TableCell>{money(s.value)}</TableCell>
                            <TableCell>
                              <Pick
                                value={s.status}
                                options={["Em andamento", "Concluído", "Cancelado"]}
                                onChange={(status) =>
                                  save({
                                    ...s.c,
                                    services: s.c.services.map((x) =>
                                      x.id === s.id ? { ...x, status } : x,
                                    ),
                                  }).then(() => {})
                                }
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {!services.length && <Empty text="Nenhum serviço registrado." />}
                  </section>
                </>
              )}
              {page === "Próximos contatos" && (
                <>
                  <div className="toolbar">
                    <Pick
                      value={taskFilter}
                      onChange={setTaskFilter}
                      options={["Pendentes", "Hoje", "Atrasados", "Concluídos", "Todos"]}
                    />
                    <span>{tasks.filter((t) => !t.done).length} retornos pendentes</span>
                  </div>
                  <section className="panel">
                    {tasks
                      .filter(
                        (t) =>
                          taskFilter === "Todos" ||
                          (taskFilter === "Concluídos" && t.done) ||
                          (!t.done &&
                            (taskFilter === "Pendentes" ||
                              (taskFilter === "Hoje" && t.at.startsWith(day())) ||
                              (taskFilter === "Atrasados" && t.at.slice(0, 10) < day()))),
                      )
                      .map((t) => (
                        <div className="schedule-row" key={t.id}>
                          <button
                            disabled={busy}
                            className={"check-btn " + (t.done ? "checked" : "")}
                            aria-label={t.done ? "Reabrir retorno" : "Concluir retorno"}
                            onClick={() =>
                              save({
                                ...t.c,
                                tasks: t.c.tasks.map((x) =>
                                  x.id === t.id ? { ...x, done: !x.done } : x,
                                ),
                              })
                            }
                          >
                            <Check size={16} />
                          </button>
                          <button className="task-title" onClick={() => open(t.c)}>
                            <b>{t.c.name}</b>
                            <small>{t.text}</small>
                          </button>
                          <span>{t.c.owner}</span>
                          <span className={!t.done && t.at.slice(0, 10) < day() ? "overdue" : ""}>
                            {fmt(t.at)} · {time(t.at)}
                          </span>
                          <span className="status">{t.done ? "Concluído" : "Pendente"}</span>
                        </div>
                      ))}
                    {!tasks.some(
                      (t) =>
                        taskFilter === "Todos" ||
                        (taskFilter === "Concluídos" && t.done) ||
                        (!t.done &&
                          (taskFilter === "Pendentes" ||
                            (taskFilter === "Hoje" && t.at.startsWith(day())) ||
                            (taskFilter === "Atrasados" && t.at.slice(0, 10) < day()))),
                    ) && <Empty text="Nenhum retorno nesta seleção." />}
                  </section>
                </>
              )}
            </>
          )}
          <footer className="page-footer">
            <span>
              virtù<span className="lime">.</span>{" "}
              <small>Inteligência no atendimento. Clareza na gestão.</small>
            </span>
            <small>Dados fictícios · Ambiente de demonstração</small>
          </footer>
        </div>
      </main>
      <Dialog
        open={!!edit}
        onOpenChange={(v) => {
          if (!v && !busy) setEdit(null);
        }}
      >
        <DialogContent className="customer-dialog">
          <DialogTitle>{edit?.revision ? "Ficha do cliente" : "Novo cliente"}</DialogTitle>
          <DialogDescription>
            Dados de contato, veículo e histórico do relacionamento.
          </DialogDescription>
          {edit && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (edit.stage === "Perdido" && !edit.loss.trim()) {
                  toast.error("Informe o motivo da perda.");
                  return;
                }
                if (
                  await save({
                    ...edit,
                    history: [
                      ...edit.history,
                      { at: new Date().toISOString(), text: "Cadastro atualizado · " + edit.stage },
                    ],
                  })
                )
                  setEdit(null);
              }}
            >
              <Tabs defaultValue="cadastro">
                <TabsList className="detail-tabs">
                  <TabsTrigger value="cadastro">Cadastro</TabsTrigger>
                  <TabsTrigger value="historico">Histórico</TabsTrigger>
                  <TabsTrigger value="operacao">Serviços e retornos</TabsTrigger>
                </TabsList>
                <TabsContent value="cadastro">
                  <div className="form-grid">
                    {field("name", "Nome *")}
                    {field("phone", "Telefone *")}
                    {field("email", "E-mail", "email")}
                    {field("city", "Cidade")}
                    <label className="field">
                      Origem
                      <Pick
                        value={edit.origin}
                        options={[
                          "WhatsApp",
                          "Instagram",
                          "Google",
                          "Indicação",
                          "Loja física",
                          "Outros",
                        ]}
                        onChange={(origin) => setEdit({ ...edit, origin })}
                      />
                    </label>
                    <label className="field">
                      Responsável
                      <Pick
                        value={edit.owner}
                        options={["Marina", "Rafael", "Guilherme"]}
                        onChange={(owner) => setEdit({ ...edit, owner })}
                      />
                    </label>
                  </div>
                  <h3 className="form-section">Veículo e necessidade</h3>
                  <div className="form-grid">
                    {field("vehicle", "Veículo / versão")}
                    {field("year", "Ano")}
                    {field("plate", "Placa")}
                    {field("measure", "Medida do pneu")}
                    {field("brand", "Marca de interesse")}
                    {field("quantity", "Pneus desejados", "number")}
                    {field("interest", "Serviço de interesse")}
                    {field("quote", "Orçamento total (R$)", "number")}
                    <label className="field">
                      Etapa do funil
                      <Pick
                        value={edit.stage}
                        options={stages}
                        onChange={(stage) => setEdit({ ...edit, stage })}
                      />
                    </label>
                    {field("created", "Primeiro atendimento", "date")}
                  </div>
                  {edit.stage === "Perdido" && (
                    <label className="field">
                      Motivo da perda
                      <input
                        list="loss-reasons"
                        value={edit.loss}
                        onChange={(e) => setEdit({ ...edit, loss: e.target.value })}
                        placeholder="Selecione ou escreva um motivo"
                        required
                      />
                      <datalist id="loss-reasons">
                        {[
                          "Fora do orçamento",
                          "Parou de responder",
                          "Comprou em outra loja",
                          "Produto indisponível",
                          "Desistiu do serviço",
                        ].map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </datalist>
                    </label>
                  )}
                  <label className="field">
                    Observações
                    <textarea
                      value={edit.notes}
                      onChange={(e) => setEdit({ ...edit, notes: e.target.value })}
                      rows={3}
                    />
                  </label>
                </TabsContent>
                <TabsContent value="historico">
                  <div className="timeline">
                    {[...edit.history].reverse().map((h, i) => (
                      <div key={i}>
                        <span className="timeline-dot" />
                        <small>
                          {fmt(h.at)} · {time(h.at)}
                        </small>
                        <p>{h.text}</p>
                      </div>
                    ))}
                    {!edit.history.length && (
                      <Empty text="O histórico começa ao salvar o cadastro." />
                    )}
                  </div>
                </TabsContent>
                <TabsContent value="operacao">
                  <h3 className="form-section">Agendamentos</h3>
                  {edit.appointments.map((a) => (
                    <p className="record-line" key={a.id}>
                      {fmt(a.at)} · {time(a.at)} — {a.service}
                      <span>{a.status}</span>
                    </p>
                  ))}
                  {!edit.appointments.length && <p className="muted">Nenhum agendamento.</p>}
                  <h3 className="form-section">Serviços prestados</h3>
                  {edit.services.map((s) => (
                    <p className="record-line" key={s.id}>
                      {fmt(s.at)} · {s.name}
                      <span>
                        {money(s.value)} · {s.status}
                      </span>
                    </p>
                  ))}
                  {!edit.services.length && <p className="muted">Nenhum serviço registrado.</p>}
                  <h3 className="form-section">Próximos contatos</h3>
                  {edit.tasks.map((t) => (
                    <p className="record-line" key={t.id}>
                      {fmt(t.at)} · {t.text}
                      <span>{t.done ? "Concluído" : "Pendente"}</span>
                    </p>
                  ))}
                  {!edit.tasks.length && <p className="muted">Nenhum retorno cadastrado.</p>}
                </TabsContent>
              </Tabs>
              <div className="dialog-actions">
                <button type="button" onClick={() => setEdit(null)} disabled={busy}>
                  Cancelar
                </button>
                <button
                  className="primary"
                  disabled={busy || !edit.name.trim() || !edit.phone.trim()}
                >
                  {busy ? "Salvando..." : "Salvar cliente"}
                </button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!form}
        onOpenChange={(v) => {
          if (!v && !busy) setForm(null);
        }}
      >
        <DialogContent>
          <DialogTitle>
            {form?.kind === "Agenda"
              ? "Agendar serviço"
              : form?.kind === "Serviços"
                ? "Registrar serviço"
                : form?.kind === "Remarcar"
                  ? "Remarcar agendamento"
                  : "Programar próximo contato"}
          </DialogTitle>
          <DialogDescription>
            Registro salvo na demonstração, sem envio de mensagens.
          </DialogDescription>
          {form && (
            <form
              key={form.kind + form.client}
              onSubmit={async (e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                const c = clients.find((x) => x.id === form.client);
                if (!c) return;
                const at = String(fd.get("at")),
                  text = String(fd.get("text") || ""),
                  id = uid();
                let next = { ...c };
                if (form.kind === "Agenda") {
                  next.appointments = [
                    ...c.appointments,
                    { id, at, service: text, status: "Agendado" },
                  ];
                  next.stage = "Agendado";
                } else if (form.kind === "Remarcar") {
                  next.appointments = c.appointments.map((a) =>
                    a.id === (form as any).id ? { ...a, at, status: "Agendado" } : a,
                  );
                } else if (form.kind === "Serviços") {
                  next.services = [
                    ...c.services,
                    { id, at, name: text, value: Number(fd.get("value")), status: "Concluído" },
                  ];
                  next.stage = "Concluído";
                } else next.tasks = [...c.tasks, { id, at, text, done: false }];
                next.history = [
                  ...c.history,
                  {
                    at: new Date().toISOString(),
                    text:
                      form.kind === "Remarcar"
                        ? "Agendamento remarcado para " + fmt(at)
                        : form.kind + ": " + text,
                  },
                ];
                if (await save(next)) setForm(null);
              }}
            >
              <label className="field">
                Cliente
                <Pick
                  value={form.client}
                  options={clients.map((c) => c.id)}
                  labels={Object.fromEntries(clients.map((c) => [c.id, c.name]))}
                  onChange={(client) => setForm({ ...form, client })}
                />
                <small>
                  {clients.find((c) => c.id === form.client)?.name ||
                    "Cadastre um cliente primeiro"}
                </small>
              </label>
              <label className="field">
                Data e horário
                <input
                  name="at"
                  type="datetime-local"
                  required
                  defaultValue={
                    form.kind === "Remarcar"
                      ? clients
                          .find((c) => c.id === form.client)
                          ?.appointments.find((a) => a.id === (form as any).id)?.at
                      : day() + "T10:00"
                  }
                />
              </label>
              {form.kind !== "Remarcar" && (
                <label className="field">
                  {form.kind === "Próximos contatos" ? "Motivo do próximo contato" : "Serviço"}
                  <input
                    name="text"
                    required
                    defaultValue={
                      form.kind === "Próximos contatos"
                        ? "Retornar orçamento"
                        : clients.find((c) => c.id === form.client)?.interest
                    }
                  />
                </label>
              )}
              {form.kind === "Serviços" && (
                <label className="field">
                  Valor total (R$)
                  <input
                    name="value"
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    defaultValue={clients.find((c) => c.id === form.client)?.quote || 0}
                  />
                </label>
              )}
              <div className="dialog-actions">
                <button type="button" disabled={busy} onClick={() => setForm(null)}>
                  Cancelar
                </button>
                <button className="primary" disabled={busy || !form.client}>
                  {busy ? "Salvando..." : "Salvar registro"}
                </button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <Toaster richColors position="bottom-right" />
    </SidebarProvider>
  );
}
function Metric({ label, value, detail, icon, accent = false }: any) {
  return (
    <section className={"metric " + (accent ? "accent-metric" : "")}>
      <div>
        <span>{label}</span>
        {icon}
      </div>
      <strong>{value}</strong>
      <p>{detail}</p>
    </section>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="empty">
      <p>{text}</p>
    </div>
  );
}
