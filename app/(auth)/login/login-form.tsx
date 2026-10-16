"use client";

import { useActionState, useEffect, useRef } from "react";
import { login, type LoginState } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  // Senha errada: o campo é limpo (de propósito) e o foco volta para ele.
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (state.error) input.current?.focus();
  }, [state]);
  return (
    <form action={action} noValidate>
      <input type="hidden" name="next" value={next} />
      <label className="field" htmlFor="password">
        Senha do gestor
        <input
          ref={input}
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          autoFocus
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "password-error" : undefined}
        />
      </label>
      {state.error && (
        <p id="password-error" role="alert" className="field-error" style={{ marginBottom: 16 }}>
          {state.error}
        </p>
      )}
      <button
        type="submit"
        className="btn btn-primary"
        disabled={pending}
        style={{ width: "100%", minHeight: 44 }}
      >
        {pending ? "Entrando..." : "Entrar"}
      </button>
    </form>
  );
}
