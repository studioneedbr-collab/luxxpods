/**
 * Máscaras de documento e contato.
 *
 * Cada uma trabalha só com dígitos: a máscara é aplicada na exibição e o
 * valor guardado é sempre limpo. Validar é separado de mascarar — um CPF
 * pode estar bem formatado e mesmo assim não existir.
 */

export const soDigitos = (v: string) => v.replace(/\D/g, "");

/* ------------------------------------------------------------------ CPF/CNPJ */

export function mascaraCPF(v: string): string {
  const d = soDigitos(v).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function mascaraCNPJ(v: string): string {
  const d = soDigitos(v).slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

/** Escolhe a máscara pelo tamanho — o fornecedor pode ser PF ou PJ. */
export function mascaraDocumento(v: string): string {
  return soDigitos(v).length > 11 ? mascaraCNPJ(v) : mascaraCPF(v);
}

/* -------------------------------------------------------------- validação */

export function cpfValido(v: string): boolean {
  const d = soDigitos(v);
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false;           // 111.111.111-11 e afins

  const digito = (ate: number) => {
    let soma = 0;
    for (let i = 0; i < ate; i++) soma += Number(d[i]) * (ate + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  return digito(9) === Number(d[9]) && digito(10) === Number(d[10]);
}

export function cnpjValido(v: string): boolean {
  const d = soDigitos(v);
  if (d.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(d)) return false;

  const digito = (ate: number) => {
    const pesos = ate === 12 ? [5,4,3,2,9,8,7,6,5,4,3,2] : [6,5,4,3,2,9,8,7,6,5,4,3,2];
    let soma = 0;
    for (let i = 0; i < ate; i++) soma += Number(d[i]) * pesos[i];
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  return digito(12) === Number(d[12]) && digito(13) === Number(d[13]);
}

export function documentoValido(v: string): boolean {
  const d = soDigitos(v);
  if (!d) return true;                                 // vazio é permitido
  return d.length > 11 ? cnpjValido(v) : cpfValido(v);
}

/* ------------------------------------------------------------------ CONTATO */

export function mascaraTelefone(v: string): string {
  const d = soDigitos(v).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function mascaraCEP(v: string): string {
  const d = soDigitos(v).slice(0, 8);
  return d.length <= 5 ? d : `${d.slice(0, 5)}-${d.slice(5)}`;
}

/** Percentual de 0 a 100, com uma casa. */
export function mascaraPercentual(v: string): string {
  const limpo = v.replace(/[^\d,]/g, "").replace(/,(?=.*,)/g, "");
  const n = Number(limpo.replace(",", "."));
  if (Number.isNaN(n)) return "";
  return limpo;
}
