"use client";

import { startTransition, useActionState, useEffect, useRef } from "react";

type Action<S> = (prev: S, form: FormData) => Promise<S>;

/**
 * useActionState sem a limpeza automática do React 19. Com <form action>, o React limpa o
 * formulário no fim de cada envio — inclusive quando o servidor devolve erro — e os <select>,
 * as caixas de marcar e as linhas de itens voltavam ao valor inicial: a escolha do gestor sumia
 * sem aviso (origem "Instagram" virava "WhatsApp", etapa "Perdido" virava "Novo contato").
 * Aqui o envio passa pelo onSubmit: com erro, tudo fica como o gestor deixou e o foco vai para o
 * primeiro campo com erro. O `action` continua no <form> para funcionar sem JavaScript.
 * Quem usa decide quando limpar (form.reset() depois de salvar).
 */
export function useActionForm<S extends { errors?: Record<string, string>; error?: string }>(
  action: Action<S>,
  initial: S,
) {
  const [state, dispatch, pending] = useActionState(
    action as (prev: Awaited<S>, form: FormData) => Promise<S>,
    initial as Awaited<S>,
  );
  const formRef = useRef<HTMLFormElement>(null);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter;
    const data = new FormData(e.currentTarget, submitter);
    startTransition(() => dispatch(data));
  };

  useEffect(() => {
    if (state.error || (state.errors && Object.keys(state.errors).length > 0)) {
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    }
  }, [state]);

  return { state, formAction: dispatch, pending, formRef, onSubmit };
}
