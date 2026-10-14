// Campo de formulário acessível: rótulo visível, dica e erro ligados por aria-describedby.

type Common = {
  name: string;
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
};

function describedBy(name: string, error?: string, hint?: string) {
  return (
    [hint ? `${name}-hint` : null, error ? `${name}-error` : null].filter(Boolean).join(" ") ||
    undefined
  );
}

function Messages({ name, error, hint }: { name: string; error?: string; hint?: string }) {
  return (
    <>
      {hint && (
        <span id={`${name}-hint`} className="hint">
          {hint}
        </span>
      )}
      {error && (
        <span id={`${name}-error`} className="field-error">
          {error}
        </span>
      )}
    </>
  );
}

export function TextField({
  name,
  label,
  error,
  hint,
  required,
  idPrefix = "",
  ...input
}: Common & { idPrefix?: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "name">) {
  const id = `${idPrefix}${name}`;
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      <input
        id={id}
        name={name}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        {...input}
      />
      <Messages name={id} error={error} hint={hint} />
    </div>
  );
}

export function SelectField({
  name,
  label,
  error,
  hint,
  required,
  options,
  idPrefix = "",
  ...select
}: Common & { idPrefix?: string; options: [string, string][] } & Omit<
    React.SelectHTMLAttributes<HTMLSelectElement>,
    "name"
  >) {
  const id = `${idPrefix}${name}`;
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      <select
        id={id}
        name={name}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        {...select}
      >
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
      <Messages name={id} error={error} hint={hint} />
    </div>
  );
}

export function TextAreaField({
  name,
  label,
  error,
  hint,
  required,
  idPrefix = "",
  ...area
}: Common & { idPrefix?: string } & Omit<
    React.TextareaHTMLAttributes<HTMLTextAreaElement>,
    "name"
  >) {
  const id = `${idPrefix}${name}`;
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      <textarea
        id={id}
        name={name}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        {...area}
      />
      <Messages name={id} error={error} hint={hint} />
    </div>
  );
}
