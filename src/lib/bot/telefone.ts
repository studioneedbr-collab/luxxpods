/**
 * Telefone brasileiro — validação, nunca conserto.
 *
 * Um número inválido que a gente "arruma" sozinho vira mensagem entregue para
 * a pessoa errada. Aqui ou o número é válido do jeito que veio, ou é recusado.
 */

/** DDDs em uso no Brasil (Anatel). Fora desta lista, não existe. */
const DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19,
  21, 22, 24, 27, 28,
  31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55,
  61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79,
  81, 82, 83, 84, 85, 86, 87, 88, 89,
  91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

export interface TelefoneValido {
  /** só dígitos, com 55 na frente: 5533912345678 */
  e164: string;
  ddd: number;
  numero: string;
  /** (33) 91234-5678 */
  formatado: string;
  celular: boolean;
}

/**
 * Decide o formato pelo COMPRIMENTO, que é o único critério não ambíguo:
 *   13 = 55 + DDD + 9 dígitos   11 = DDD + 9 dígitos
 *   12 = 55 + DDD + 8 dígitos   10 = DDD + 8 dígitos (fixo)
 */
export function validarTelefone(bruto: string | null | undefined): TelefoneValido | null {
  if (!bruto) return null;
  const d = String(bruto).replace(/\D/g, "");

  let ddd: number;
  let numero: string;

  if (d.length === 13 && d.startsWith("55")) {
    ddd = Number(d.slice(2, 4)); numero = d.slice(4);
  } else if (d.length === 12 && d.startsWith("55")) {
    ddd = Number(d.slice(2, 4)); numero = d.slice(4);
  } else if (d.length === 11 || d.length === 10) {
    ddd = Number(d.slice(0, 2)); numero = d.slice(2);
  } else {
    return null;
  }

  if (!DDDS.has(ddd)) return null;

  // celular tem 9 dígitos e começa com 9; fixo tem 8 e começa de 2 a 5
  const celular = numero.length === 9;
  if (celular && !numero.startsWith("9")) return null;
  if (!celular && !/^[2-5]/.test(numero)) return null;

  return {
    e164: `55${ddd}${numero}`,
    ddd,
    numero,
    formatado: celular
      ? `(${ddd}) ${numero.slice(0, 5)}-${numero.slice(5)}`
      : `(${ddd}) ${numero.slice(0, 4)}-${numero.slice(4)}`,
    celular,
  };
}

/** Só para exibição — não valida. */
export function formatarTelefone(bruto?: string | null): string {
  return validarTelefone(bruto)?.formatado ?? bruto ?? "—";
}
