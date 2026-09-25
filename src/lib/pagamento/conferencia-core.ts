/**
 * A decisão de conferência do pagamento, sem banco e sem rede.
 *
 * É a regra que decide se o dinheiro que chegou confirma o pedido. Ficar
 * aqui, pura, é o que permite testá-la sozinha — e é a parte em que errar
 * custa dinheiro de verdade: confirmar um pedido que não foi pago, ou
 * deixar um pedido pago parado esperando alguém perceber.
 */

export type SituacaoPagamento = "aprovado" | "recusado" | "estornado" | "pendente";

export interface EstadoDoPedido {
  /** null quando o número do webhook não bate com nenhum pedido */
  total: number | null;
  jaPago: boolean;
  /** qual transação pagou — para separar progressão de status de duplicidade */
  transacaoPaga?: string | null;
}

export type Decisao =
  | { acao: "confirmar" }
  | { acao: "registrar"; motivo: string }
  | { acao: "recusar"; motivo: string; chamarGente?: boolean };

/** margem de centavo: arredondamento de gateway não é divergência */
const TOLERANCIA = 0.02;

export function decidirPagamento(
  pedido: EstadoDoPedido,
  situacao: SituacaoPagamento,
  valorRecebido: number,
  idTransacao?: string,
): Decisao {
  if (pedido.total === null) {
    return { acao: "recusar", motivo: "pedido não encontrado" };
  }

  // um evento que não é aprovação só vira registro — nunca confirma nada
  if (situacao !== "aprovado") {
    return { acao: "registrar", motivo: `pagamento ${situacao}` };
  }

  if (pedido.jaPago) {
    // a mesma transação mandando aprovação de novo é progressão de status,
    // não cobrança dobrada: o Asaas manda PAYMENT_CONFIRMED e depois
    // PAYMENT_RECEIVED do mesmo pagamento. Tratar isso como duplicidade
    // encheria a loja de tarefa urgente falsa a cada venda.
    if (idTransacao && pedido.transacaoPaga && idTransacao === pedido.transacaoPaga) {
      return { acao: "registrar", motivo: "pagamento já confirmado" };
    }

    // transação diferente num pedido pago é cobrança em duplicidade de verdade
    return { acao: "recusar", motivo: "pedido já estava pago", chamarGente: true };
  }

  const diferenca = Math.abs(pedido.total - valorRecebido);
  if (diferenca > TOLERANCIA) {
    return {
      acao: "recusar",
      motivo: `valor divergente: recebido ${valorRecebido}, esperado ${pedido.total}`,
      chamarGente: true,
    };
  }

  return { acao: "confirmar" };
}
