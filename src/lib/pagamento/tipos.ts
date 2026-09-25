/**
 * Contrato do meio de pagamento.
 *
 * O sistema fala com esta interface, nunca com a API do gateway direto —
 * pelo mesmo motivo do canal de mensagens: trocar de provedor (ou operar
 * sem nenhum, com o PIX estático) não muda o fluxo de venda.
 */

export interface ItemCobranca {
  descricao: string;
  quantidade: number;
  /** em reais; o provedor converte para centavos se precisar */
  precoUnitario: number;
}

export interface DadosCobranca {
  pedidoId: string;
  numeroPedido: string;
  total: number;
  itens: ItemCobranca[];
  cliente?: {
    nome?: string | null;
    email?: string | null;
    telefone?: string | null;
  };
  entrega?: {
    cep?: string | null;
    numero?: string | null;
    complemento?: string | null;
  };
}

export interface Cobranca {
  /** identificador da cobrança no provedor */
  idExterno: string;
  /** link de checkout, quando o provedor trabalha assim */
  link?: string;
  /** copia e cola, quando é PIX direto */
  copiaECola?: string;
  /** data URI do QR Code */
  qrCode?: string;
  expiraEm?: Date;
}

export interface EventoPagamento {
  /** id único do evento, para não processar duas vezes */
  id: string;
  /** o que casa o pagamento com o pedido */
  referenciaPedido: string;
  idTransacao: string;
  situacao: "aprovado" | "recusado" | "estornado" | "pendente";
  valor: number;
  metodo: string;
  em: Date;
  /**
   * Outro jeito de achar o pedido, quando o número não veio no corpo.
   * O QR estático do Asaas identifica o pagamento pelo id do QR Code.
   */
  referenciaAlternativa?: string;
}

export interface MeioPagamento {
  nome: string;
  /** o pagamento confirma sozinho, ou alguém confere o comprovante? */
  confirmacaoAutomatica: boolean;
  configurado(): boolean;
  criarCobranca(dados: DadosCobranca): Promise<
    { ok: true; cobranca: Cobranca } | { ok: false; erro: string }
  >;
  interpretarWebhook(corpo: unknown): EventoPagamento | null;
  validarAssinatura?(corpo: string, cabecalhos: Headers): boolean;
  /**
   * Pergunta ao provedor se a cobrança foi paga.
   *
   * O webhook pode não chegar — provedor fora do ar, deploy no meio, rede.
   * Sem esta consulta, um pedido pago ficaria parado até alguém desconfiar.
   */
  conferirPagamento?(
    numeroPedido: string, idExterno?: string,
  ): Promise<EventoPagamento | null>;
}
