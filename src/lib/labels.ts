import type { BadgeTom } from "@/components/ui";
import type {
  Canal, ConversaEstado, MovimentoTipo, PagamentoMetodo,
  PagamentoStatus, PedidoStatus,
} from "./types";

export const STATUS_PEDIDO: Record<PedidoStatus, { rotulo: string; tom: BadgeTom }> = {
  pendente:             { rotulo: "Pendente",          tom: "neutro" },
  aguardando_pagamento: { rotulo: "Aguard. pagamento", tom: "warn" },
  confirmado:           { rotulo: "Confirmado",        tom: "ok" },
  em_separacao:         { rotulo: "Em separação",      tom: "info" },
  saiu_para_entrega:    { rotulo: "Saiu p/ entrega",   tom: "brand" },
  entregue:             { rotulo: "Entregue",          tom: "ok" },
  cancelado:            { rotulo: "Cancelado",         tom: "bad" },
};

export const FLUXO_PEDIDO: PedidoStatus[] = [
  "pendente", "aguardando_pagamento", "confirmado",
  "em_separacao", "saiu_para_entrega", "entregue",
];

export const STATUS_PAGAMENTO: Record<PagamentoStatus, { rotulo: string; tom: BadgeTom }> = {
  aguardando: { rotulo: "Aguardando", tom: "warn" },
  aprovado:   { rotulo: "Pago",       tom: "ok" },
  recusado:   { rotulo: "Recusado",   tom: "bad" },
  expirado:   { rotulo: "Expirado",   tom: "neutro" },
  cancelado:  { rotulo: "Cancelado",  tom: "bad" },
  estornado:  { rotulo: "Estornado",  tom: "bad" },
};

export const METODO_PAGAMENTO: Record<PagamentoMetodo, string> = {
  pix: "PIX",
  dinheiro: "Dinheiro",
  cartao_credito: "Crédito",
  cartao_debito: "Débito",
  transferencia: "Transferência",
};

export const ESTADO_CONVERSA: Record<ConversaEstado, { rotulo: string; tom: BadgeTom }> = {
  INITIAL:         { rotulo: "Início",              tom: "neutro" },
  CATALOG_SENT:    { rotulo: "Catálogo enviado",    tom: "info" },
  PRODUCT_SELECTION:{ rotulo: "Escolhendo produto", tom: "info" },
  CART:            { rotulo: "Carrinho",            tom: "brand" },
  ADDRESS:         { rotulo: "Endereço",            tom: "brand" },
  PAYMENT:         { rotulo: "Pagamento",           tom: "warn" },
  ORDER_REVIEW:    { rotulo: "Revisão do pedido",   tom: "warn" },
  ORDER_CONFIRMED: { rotulo: "Pedido confirmado",   tom: "ok" },
  COMPLETED:       { rotulo: "Concluído",           tom: "ok" },
  HUMAN:           { rotulo: "Com atendente",       tom: "gold" },
  ABANDONED:       { rotulo: "Abandonado",          tom: "bad" },
};

export const CANAL: Record<Canal, { rotulo: string; cor: string }> = {
  whatsapp:  { rotulo: "WhatsApp",  cor: "#25D366" },
  instagram: { rotulo: "Instagram", cor: "#E1306C" },
  manual:    { rotulo: "Manual",    cor: "#9563ff" },
  site:      { rotulo: "Site",      cor: "#0ea5e9" },
};

export const MOVIMENTO: Record<MovimentoTipo, { rotulo: string; tom: BadgeTom; sinal: 1 | -1 | 0 }> = {
  entrada:           { rotulo: "Entrada",           tom: "ok",     sinal: 1 },
  venda:             { rotulo: "Venda",             tom: "brand",  sinal: -1 },
  reserva:           { rotulo: "Reserva",           tom: "warn",   sinal: 0 },
  liberacao_reserva: { rotulo: "Liberação",         tom: "neutro", sinal: 0 },
  cancelamento:      { rotulo: "Cancelamento",      tom: "info",   sinal: 1 },
  troca:             { rotulo: "Troca",             tom: "warn",   sinal: -1 },
  ajuste_positivo:   { rotulo: "Ajuste +",          tom: "ok",     sinal: 1 },
  ajuste_negativo:   { rotulo: "Ajuste −",          tom: "bad",    sinal: -1 },
  devolucao:         { rotulo: "Devolução",         tom: "info",   sinal: 1 },
};

export const PRIORIDADE: Record<string, BadgeTom> = {
  baixa: "neutro", media: "info", alta: "warn", urgente: "bad",
};
