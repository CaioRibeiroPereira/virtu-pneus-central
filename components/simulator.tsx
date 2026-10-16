"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { RotateCcw, Send } from "lucide-react";
import {
  processPresetAction,
  resetDemoAction,
  sendCustomJsonAction,
  type SendResult,
} from "@/app/(app)/simulador/actions";

type PresetView = {
  id: string;
  title: string;
  expected: string;
  phone: string;
  messages: { from: string; text: string }[];
  events: unknown[];
};

const STATUS_TEXT: Record<string, string> = {
  applied: "Aplicado automaticamente",
  queued_for_review: "Enviado para a sua revisão",
  duplicate: "Já recebido antes: nada foi gravado de novo",
};

function Results({ results }: { results: SendResult[] }) {
  return (
    <ol className="stack" style={{ marginTop: 12 }} aria-label="Respostas do sistema">
      {results.map((r, i) => {
        const status = String(r.body.status ?? r.body.error ?? "erro");
        return (
          <li key={`${r.eventId}-${i}`} className="card" style={{ padding: 12 }}>
            <p>
              <strong>{r.type}</strong> · HTTP {r.httpStatus}
            </p>
            <p
              className={
                r.httpStatus >= 400
                  ? "field-error"
                  : status === "queued_for_review"
                    ? "due-today"
                    : ""
              }
            >
              {STATUS_TEXT[status] ?? status}
            </p>
            {status === "applied" && typeof r.body.customer_id === "string" && (
              <Link href={`/clientes/${r.body.customer_id}`}>Ver na ficha do cliente</Link>
            )}
            {status === "queued_for_review" && <Link href="/revisao">Abrir a fila de revisão</Link>}
            <details style={{ marginTop: 4 }}>
              <summary style={{ minHeight: 44, display: "flex", alignItems: "center" }}>
                Resposta completa (JSON)
              </summary>
              <pre
                style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: "0.875rem" }}
              >
                {JSON.stringify(r.body, null, 2)}
              </pre>
            </details>
          </li>
        );
      })}
    </ol>
  );
}

export function Simulator({
  presets,
  exampleJson,
}: {
  presets: PresetView[];
  exampleJson: string;
}) {
  const [selected, setSelected] = useState(presets[0]?.id);
  const [results, setResults] = useState<Record<string, SendResult[]>>({});
  const [customJson, setCustomJson] = useState(exampleJson);
  const [customResults, setCustomResults] = useState<SendResult[] | null>(null);
  const [customError, setCustomError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const preset = presets.find((p) => p.id === selected)!;

  const run = (id: string) =>
    start(async () => {
      const r = await processPresetAction(id);
      setResults((prev) => ({ ...prev, [id]: r }));
    });

  return (
    <>
      <section className="card" aria-labelledby="conversas">
        <h2 id="conversas" style={{ marginBottom: 12 }}>
          1. Escolha uma conversa
        </h2>
        <div className="btn-row" role="group" aria-label="Conversas fictícias">
          {presets.map((p, i) => (
            <button
              key={p.id}
              type="button"
              className="btn"
              aria-pressed={selected === p.id}
              aria-current={selected === p.id ? "page" : undefined}
              onClick={() => setSelected(p.id)}
            >
              {i + 1}. {p.title}
            </button>
          ))}
        </div>
      </section>

      <section className="card section" aria-labelledby="conversa-atual">
        <h2 id="conversa-atual">{preset.title}</h2>
        <p className="muted" style={{ marginTop: 4 }}>
          WhatsApp {preset.phone} · Esperado: {preset.expected}
        </p>
        <ol className="stack" style={{ marginTop: 12 }} aria-label="Mensagens da conversa">
          {preset.messages.map((m, i) => (
            <li
              key={i}
              className="card"
              style={{
                padding: 12,
                maxWidth: "85%",
                alignSelf: m.from === "cliente" ? "flex-start" : "flex-end",
                background: m.from === "cliente" ? "var(--surface)" : "var(--info-bg)",
              }}
            >
              <p className="muted" style={{ fontSize: "0.875rem", fontWeight: 600 }}>
                {m.from === "cliente"
                  ? "Cliente"
                  : m.from === "vito"
                    ? // Do lado da loja quem responde no WhatsApp é o atendente; o Vito só lê a
                      // conversa e extrai os dados (ele nunca passa preço — D57).
                      "Loja (atendente)"
                    : "Sistema"}
              </p>
              <p>{m.text}</p>
            </li>
          ))}
        </ol>

        <details className="disclosure" style={{ marginTop: 12 }}>
          <summary>2. Ver o que o Vito extrai ({preset.events.length} eventos JSON)</summary>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              fontSize: "0.875rem",
              marginTop: 8,
            }}
          >
            {JSON.stringify(preset.events, null, 2)}
          </pre>
        </details>

        <div className="btn-row" style={{ marginTop: 16 }}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={pending}
            onClick={() => run(preset.id)}
          >
            <Send aria-hidden="true" size={18} />
            {results[preset.id] ? "Enviar de novo" : "3. Encerrar conversa e enviar ao Vito"}
          </button>
        </div>
        <p className="muted" style={{ marginTop: 8, fontSize: "0.9375rem" }}>
          Quando o atendente encerra a conversa no WhatsApp, ela vai para o Vito extrair os dados.
          Em produção, quem faz esse envio é o n8n; aqui, este botão.
        </p>
        <div aria-live="polite">
          {results[preset.id] && (
            <p className="muted" style={{ marginTop: 8 }}>
              Conversa encerrada pelo atendente.
            </p>
          )}
          {results[preset.id] && <Results results={results[preset.id]} />}
        </div>
      </section>

      <section className="card section" aria-labelledby="json-livre">
        <h2 id="json-livre">Evento personalizado (JSON)</h2>
        <p className="muted" style={{ marginTop: 4 }}>
          Para testar o contrato do §8: um evento ou uma lista de eventos.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await sendCustomJsonAction(customJson);
              setCustomError(r.error ?? null);
              setCustomResults(r.results ?? null);
            });
          }}
        >
          <div className="field" style={{ marginTop: 12 }}>
            <label htmlFor="json">JSON do evento</label>
            <textarea
              id="json"
              value={customJson}
              onChange={(e) => setCustomJson(e.target.value)}
              rows={14}
              spellCheck={false}
              style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.875rem" }}
              aria-describedby={customError ? "json-error" : undefined}
            />
            {customError && (
              <span id="json-error" className="field-error" role="alert">
                {customError}
              </span>
            )}
          </div>
          <button type="submit" className="btn" disabled={pending}>
            Enviar evento
          </button>
        </form>
        <div aria-live="polite">{customResults && <Results results={customResults} />}</div>
      </section>

      <section className="card section" aria-labelledby="reiniciar">
        <h2 id="reiniciar">Reiniciar demonstração</h2>
        <p className="muted" style={{ marginTop: 4 }}>
          Apaga tudo e recria os clientes fictícios com datas relativas a hoje.
        </p>
        <button
          type="button"
          className="btn btn-danger"
          style={{ marginTop: 12 }}
          disabled={pending}
          onClick={() => {
            if (!window.confirm("Apagar os dados atuais e recriar a demonstração?")) return;
            start(async () => {
              const r = await resetDemoAction();
              setResults({});
              setCustomResults(null);
              toast.success(r.message);
            });
          }}
        >
          <RotateCcw aria-hidden="true" size={18} /> Reiniciar demonstração
        </button>
      </section>
    </>
  );
}
