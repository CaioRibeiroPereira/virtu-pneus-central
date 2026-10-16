// Valor em reais digitado pelo gestor (sem zod: usado também na tela da Revisão).

/**
 * Aceita "1840", "1840,50", "1.840,50", "R$ 1.840,50", "1.840" e "1840.50".
 * Sem vírgula, ponto seguido de 3 dígitos é milhar ("1.840" = mil oitocentos e quarenta, como se
 * escreve no Brasil); antes ele virava R$ 1,84 sem aviso.
 */
export function parseMoneyBR(value: string): number {
  const clean = value.replace(/R\$|\s/g, "");
  if (clean === "") return NaN;
  if (clean.includes(",")) {
    if (!/^\d{1,3}(\.\d{3})*,\d{1,2}$|^\d+,\d{1,2}$/.test(clean)) return NaN;
    return Number(clean.replace(/\./g, "").replace(",", "."));
  }
  if (/^\d{1,3}(\.\d{3})+$/.test(clean)) return Number(clean.replace(/\./g, ""));
  return /^\d+(\.\d{1,2})?$/.test(clean) ? Number(clean) : NaN;
}
