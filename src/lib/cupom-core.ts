/**
 * Se o cupom vale, e quanto ele tira.
 *
 * Pura de propósito: é conta de dinheiro que o cliente vê antes de pagar, e
 * errar aqui é cobrar diferente do combinado. O banco tem a mesma regra em
 * `recalcular_carrinho` — esta é a que explica a recusa para o atendente.
 */

export interface CupomParaValidar {
  codigo: string;
  tipo_desconto: "valor" | "percentual";
  valor: number;
  valor_minimo: number;
  status: "ativo" | "inativo";
  inicio?: string | null;
  fim?: string | null;
  limite_total?: number | null;
  usos: number;
}

export type ResultadoCupom =
  | { vale: true; desconto: number }
  | { vale: false; motivo: string };

export function avaliarCupom(
  cupom: CupomParaValidar | null,
  subtotal: number,
  agora: Date = new Date(),
): ResultadoCupom {
  if (!cupom) return { vale: false, motivo: "Cupom não encontrado." };

  if (cupom.status !== "ativo") {
    return { vale: false, motivo: `O cupom ${cupom.codigo} está desativado.` };
  }

  if (cupom.inicio && agora < new Date(cupom.inicio)) {
    return { vale: false, motivo: `O cupom ${cupom.codigo} ainda não começou a valer.` };
  }

  if (cupom.fim && agora > new Date(cupom.fim)) {
    return { vale: false, motivo: `O cupom ${cupom.codigo} venceu.` };
  }

  if (cupom.limite_total != null && cupom.usos >= cupom.limite_total) {
    return { vale: false, motivo: `O cupom ${cupom.codigo} esgotou os usos.` };
  }

  if (subtotal < cupom.valor_minimo) {
    const falta = cupom.valor_minimo - subtotal;
    return {
      vale: false,
      motivo:
        `O cupom ${cupom.codigo} vale a partir de R$ ${cupom.valor_minimo.toFixed(2)} — ` +
        `faltam R$ ${falta.toFixed(2)}.`,
    };
  }

  const bruto = cupom.tipo_desconto === "percentual"
    ? (subtotal * cupom.valor) / 100
    : cupom.valor;

  // o desconto nunca passa do subtotal: pedido não fecha com total negativo
  const desconto = Math.min(Math.round(bruto * 100) / 100, subtotal);

  if (desconto <= 0) {
    return { vale: false, motivo: `O cupom ${cupom.codigo} não gera desconto neste pedido.` };
  }

  return { vale: true, desconto };
}
