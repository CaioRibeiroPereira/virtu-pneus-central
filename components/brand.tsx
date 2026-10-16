/** Marca da oficina: pneu visto de lado + "Virtù Pneus". O nome vem em texto (leitor de tela lê). */
export function Brand() {
  return (
    <>
      <svg
        className="brand-mark"
        width="28"
        height="28"
        viewBox="0 0 34 34"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="17" cy="17" r="13" fill="none" stroke="currentColor" strokeWidth="5" />
        <circle cx="17" cy="17" r="4" fill="currentColor" />
      </svg>
      <span>
        Virtù <span className="brand-accent">Pneus</span>
      </span>
    </>
  );
}
