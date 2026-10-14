"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  return (
    <form action={action} noValidate>
      <input type="hidden" name="next" value={next} />
      <label className="field" htmlFor="password">
        Senha do gestor
        <input
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
