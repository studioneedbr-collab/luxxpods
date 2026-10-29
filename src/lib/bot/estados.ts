/**
 * Máquina de estados da conversa (§27 do escopo).
 *
 * O bot não descobre em que pé está a venda relendo o histórico — ele guarda
 * o estado e o contexto. Assim "quero o watermelon" significa coisas
 * diferentes em PRODUCT_SELECTION e em ADDRESS, sem ambiguidade.
 */

import type { ConversaEstado } from "../types";
import type { Intencao } from "./intencoes";

/** O que a conversa já sabe. Nunca inferido do texto: sempre gravado. */
export interface Contexto {
  cliente_nome?: string;
  maioridade_validada?: boolean;
  marca_interesse?: string;
  modelo_interesse?: string;
  /** sabor pedido antes do modelo ("peach mango" → "tenho no V600 e no X") */
  sabor_procurado?: string;
  product_flavor_id?: string;
  produto_selecionado?: string;
  sabor_selecionado?: string;
  quantidade?: number;
  cart_id?: string;
  endereco_id?: string;
  endereco_confirmado?: boolean;
  /** endereço salvo que o bot ofereceu ("entrego no mesmo?"), esperando o sim */
  endereco_sugerido_id?: string;
  /** endereço lido sem bairro: o bot pergunta só o que falta */
  endereco_parcial?: { rua: string; numero: string; complemento: string | null; referencia: string | null };
  forma_pagamento?: FormaPagamento;
  /** forma que o cliente costuma usar, oferecida ("vai no PIX de novo?") */
  pagamento_sugerido?: FormaPagamento;
  troco_para?: number;
  /** dinheiro: o cliente já respondeu sobre troco (mesmo que sem troco) */
  troco_respondido?: boolean;
  order_numero?: string;
  /** último pedido oferecido para repetir, esperando o sim */
  repetir_pedido_id?: string;
  /** o bot já perguntou a preferência nesta conversa */
  pref_perguntada?: boolean;
  payment_id?: string;
  pagamento_status?: "aguardando" | "aprovado";
  order_id?: string;
  catalogo_enviado_em?: string;
  followup_agendado?: boolean;
  /** quantas vezes o bot não entendeu seguidas — 3 chama gente */
  falhas_seguidas?: number;
  /** oferta de upsell esperando resposta */
  upsell_pendente?: string;
  /** o que já foi oferecido nesta conversa: cada regra só uma vez */
  upsell_oferecidos?: string[];
}

export type FormaPagamento = "pix" | "dinheiro" | "cartao_credito" | "cartao_debito";

export interface Transicao {
  de: ConversaEstado;
  para: ConversaEstado;
  /** o que precisa estar no contexto para poder ir */
  exige?: (ctx: Contexto) => boolean;
  motivo: string;
}

/**
 * Transições permitidas. O que não está aqui não acontece — é isso que
 * impede o bot de confirmar um pedido sem endereço ou sem pagamento.
 */
export const TRANSICOES: Transicao[] = [
  { de: "INITIAL", para: "CATALOG_SENT", motivo: "catálogo enviado" },
  { de: "INITIAL", para: "PRODUCT_SELECTION", motivo: "cliente já disse o que quer" },
  { de: "INITIAL", para: "HUMAN", motivo: "pediu atendente" },
  { de: "INITIAL", para: "CART", motivo: "já chegou dizendo o que quer",
    exige: (c) => Boolean(c.product_flavor_id) },

  { de: "CATALOG_SENT", para: "PRODUCT_SELECTION", motivo: "cliente escolheu marca ou modelo" },
  { de: "CATALOG_SENT", para: "CART", motivo: "escolheu produto e sabor de uma vez",
    exige: (c) => Boolean(c.product_flavor_id) },
  { de: "CATALOG_SENT", para: "HUMAN", motivo: "pediu atendente" },
  { de: "CATALOG_SENT", para: "ABANDONED", motivo: "sumiu depois do catálogo" },

  { de: "PRODUCT_SELECTION", para: "CART", motivo: "item no carrinho",
    exige: (c) => Boolean(c.product_flavor_id) },
  { de: "PRODUCT_SELECTION", para: "CATALOG_SENT", motivo: "voltou a olhar opções" },
  { de: "PRODUCT_SELECTION", para: "HUMAN", motivo: "pediu atendente" },

  { de: "CART", para: "PRODUCT_SELECTION", motivo: "quer adicionar outro item" },
  { de: "CART", para: "ADDRESS", motivo: "fechou o carrinho",
    exige: (c) => Boolean(c.cart_id) },
  { de: "CART", para: "HUMAN", motivo: "pediu atendente" },

  { de: "ADDRESS", para: "PAYMENT", motivo: "endereço confirmado",
    exige: (c) => c.endereco_confirmado === true },
  { de: "ADDRESS", para: "CART", motivo: "voltou a mexer no carrinho" },

  { de: "PAYMENT", para: "ORDER_REVIEW", motivo: "forma de pagamento escolhida",
    exige: (c) => Boolean(c.forma_pagamento) },
  { de: "PAYMENT", para: "ADDRESS", motivo: "quis trocar o endereço" },

  { de: "ORDER_REVIEW", para: "ORDER_CONFIRMED", motivo: "cliente confirmou",
    // PIX só passa com pagamento aprovado — a regra que protege o estoque
    exige: (c) =>
      (Boolean(c.forma_pagamento) && c.forma_pagamento !== "pix") ||
      (c.forma_pagamento === "pix" && c.pagamento_status === "aprovado") },
  // PIX: o pedido nasce aguardando pagamento (ORDER_REVIEW → PAYMENT, abaixo)
  // e a conversa só vai a confirmado quando o dinheiro cai
  { de: "PAYMENT", para: "ORDER_CONFIRMED", motivo: "o PIX caiu",
    exige: (c) => c.pagamento_status === "aprovado" && Boolean(c.order_id) },
  { de: "ORDER_REVIEW", para: "CART", motivo: "pediu para alterar" },
  { de: "ORDER_REVIEW", para: "PAYMENT",
    motivo: "trocou a forma de pagamento, ou pedido PIX criado aguardando o dinheiro" },

  { de: "ORDER_CONFIRMED", para: "COMPLETED", motivo: "pedido entregue",
    exige: (c) => Boolean(c.order_id) },

  { de: "COMPLETED", para: "INITIAL", motivo: "cliente voltou a chamar" },
  { de: "ABANDONED", para: "INITIAL", motivo: "cliente voltou a chamar" },
  { de: "HUMAN", para: "INITIAL", motivo: "atendimento devolvido ao bot" },
];

export interface ResultadoTransicao {
  permitida: boolean;
  estado: ConversaEstado;
  motivo?: string;
  /** o que falta no contexto, quando a transição é negada */
  falta?: string;
}

const EXPLICA_FALTA: Partial<Record<ConversaEstado, string>> = {
  CART: "nenhum produto escolhido ainda",
  ADDRESS: "o carrinho está vazio",
  PAYMENT: "o endereço ainda não foi confirmado",
  ORDER_REVIEW: "a forma de pagamento ainda não foi escolhida",
  ORDER_CONFIRMED: "o PIX ainda não caiu",
  COMPLETED: "o pedido ainda não foi criado",
};

export function podeIr(
  de: ConversaEstado, para: ConversaEstado, ctx: Contexto,
): ResultadoTransicao {
  if (de === para) return { permitida: true, estado: para, motivo: "sem mudança" };

  const transicao = TRANSICOES.find((t) => t.de === de && t.para === para);
  if (!transicao) {
    return {
      permitida: false, estado: de,
      motivo: `${de} não vai direto para ${para}`,
    };
  }

  if (transicao.exige && !transicao.exige(ctx)) {
    return {
      permitida: false, estado: de,
      motivo: transicao.motivo,
      falta: EXPLICA_FALTA[para] ?? "falta informação no contexto",
    };
  }

  return { permitida: true, estado: para, motivo: transicao.motivo };
}

/** Para onde a conversa deveria ir, dada a intenção do cliente. */
export function proximoEstado(
  atual: ConversaEstado, intencao: Intencao, ctx: Contexto,
): ConversaEstado {
  // pedir gente interrompe qualquer fluxo, em qualquer ponto
  if (intencao === "falar_humano" || intencao === "problema" || intencao === "troca") {
    return "HUMAN";
  }

  switch (intencao) {
    case "catalogo":
      return atual === "INITIAL" ? "CATALOG_SENT" : atual;
    case "marca": case "modelo": case "sabor": case "preco": case "estoque":
      return podeIr(atual, "PRODUCT_SELECTION", ctx).permitida ? "PRODUCT_SELECTION" : atual;
    case "comprar":
      if (ctx.product_flavor_id) {
        return podeIr(atual, "CART", ctx).permitida ? "CART" : atual;
      }
      return podeIr(atual, "CATALOG_SENT", ctx).permitida ? "CATALOG_SENT" : atual;
    case "endereco":
      return podeIr(atual, "ADDRESS", ctx).permitida ? "ADDRESS" : atual;
    case "pagamento": case "pix": case "dinheiro": case "troco":
      return podeIr(atual, "PAYMENT", ctx).permitida ? "PAYMENT" : atual;
    case "confirmar":
      return podeIr(atual, "ORDER_CONFIRMED", ctx).permitida ? "ORDER_CONFIRMED" : atual;
    case "alterar_pedido":
      return podeIr(atual, "CART", ctx).permitida ? "CART" : atual;
    case "cancelar":
      return "ABANDONED";
    default:
      return atual;
  }
}

/** Três "não entendi" seguidos param de insistir e chamam gente. */
export function deveChamarHumano(ctx: Contexto): boolean {
  return (ctx.falhas_seguidas ?? 0) >= 3;
}
