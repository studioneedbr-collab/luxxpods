export type Canal = "whatsapp" | "instagram" | "manual" | "site";
export type SenderTipo = "cliente" | "bot" | "atendente" | "sistema";
export type MensagemTipo =
  | "texto" | "imagem" | "audio" | "video" | "documento"
  | "sistema" | "produto" | "pix" | "botao" | "localizacao";
export type ConversaEstado =
  | "INITIAL" | "CATALOG_SENT" | "PRODUCT_SELECTION" | "CART" | "ADDRESS"
  | "PAYMENT" | "ORDER_REVIEW" | "ORDER_CONFIRMED" | "COMPLETED" | "HUMAN" | "ABANDONED";
export type PedidoStatus =
  | "pendente" | "aguardando_pagamento" | "confirmado" | "em_separacao"
  | "saiu_para_entrega" | "entregue" | "cancelado";
export type PagamentoStatus =
  | "aguardando" | "aprovado" | "recusado" | "expirado" | "cancelado" | "estornado";
export type PagamentoMetodo =
  | "pix" | "dinheiro" | "cartao_credito" | "cartao_debito" | "transferencia";
export type MovimentoTipo =
  | "entrada" | "venda" | "reserva" | "liberacao_reserva" | "cancelamento"
  | "troca" | "ajuste_positivo" | "ajuste_negativo" | "devolucao";

export interface Metricas {
  faturamento: number;
  cmv: number;
  lucro_bruto: number;
  pedidos: number;
  pedidos_cancelados: number;
  pedidos_despachados: number;
  pedidos_entregues: number;
  ticket_medio: number;
  clientes_novos: number;
  clientes_total: number;
  clientes_recorrentes: number;
  leads: number;
  leads_ganhos: number;
  leads_perdidos: number;
  conversas: number;
  conversas_abertas: number;
  conversas_aguardando: number;
  conversas_nao_respondidas: number;
  mensagens_recebidas: number;
  taxa_conversao: number;
  taxa_cancelamento: number;
  tempo_primeira_resposta: number;
  faturamento_bot: number;
}

export interface SeriePonto {
  dia: string;
  faturamento: number;
  pedidos: number;
  leads: number;
}

export interface Conversa {
  id: string;
  customer_id: string | null;
  canal: Canal;
  estado: ConversaEstado;
  status: string;
  bot_ativo: boolean;
  nao_lidas: number;
  ultima_mensagem: string | null;
  ultima_mensagem_em: string | null;
  responsavel_id: string | null;
  created_at: string;
  /** o que a conversa já sabe: produto escolhido, endereço, pagamento */
  contexto?: Record<string, unknown>;
  cliente?: Cliente | null;
  lead_id?: string | null;
}

export interface Mensagem {
  id: string;
  conversation_id: string;
  sender_type: SenderTipo;
  tipo: MensagemTipo;
  conteudo: string | null;
  arquivo_url: string | null;
  status: string;
  created_at: string;
}

export interface Cliente {
  id: string;
  nome: string;
  telefone: string | null;
  instagram_username: string | null;
  canal_origem: Canal | null;
  origem: string | null;
  maioridade_validada: boolean;
  tags: string[];
  total_pedidos: number;
  total_comprado: number;
  ticket_medio: number;
  ultima_compra: string | null;
  ultima_interacao: string | null;
  created_at: string;
  observacoes?: string | null;
}

export interface ItemCatalogo {
  product_flavor_id: string;
  product_id: string;
  brand_id: string | null;
  flavor_id: string;
  sku: string | null;
  produto: string;
  modelo: string | null;
  puffs: number | null;
  marca: string | null;
  sabor: string;
  preco: number;
  custo: number;
  custo_medio: number;
  imagem_url: string | null;
  estoque_total: number;
  estoque_reservado: number;
  estoque_disponivel: number;
  estoque_minimo: number;
  sabor_ativo: boolean;
  produto_status: "ativo" | "inativo";
  vendavel: boolean;
}

export interface Produto {
  id: string;
  nome: string;
  modelo: string | null;
  marca: string | null;
  brand_id: string | null;
  puffs: number | null;
  sku: string | null;
  preco: number;
  custo: number;
  status: "ativo" | "inativo";
  destaque: boolean;
  imagem_url: string | null;
  descricao: string | null;
  sabores: number;
  sabores_disponiveis: number;
  estoque: number;
  margem: number;
}

export interface Pedido {
  id: string;
  numero_pedido: string;
  cliente_nome: string | null;
  cliente_telefone: string | null;
  customer_id: string | null;
  conversation_id: string | null;
  canal: Canal;
  origem: string;
  subtotal: number;
  desconto: number;
  taxa_entrega: number;
  total: number;
  custo_total: number;
  forma_pagamento: PagamentoMetodo;
  status_pagamento: PagamentoStatus;
  status_pedido: PedidoStatus;
  troco_para: number | null;
  valor_troco: number | null;
  observacoes: string | null;
  impresso?: boolean;
  endereco_snapshot: Record<string, string> | null;
  created_at: string;
  confirmado_em: string | null;
  separado_em?: string | null;
  despachado_em?: string | null;
  entregue_em: string | null;
  cancelado_em?: string | null;
  motivo_cancelamento?: string | null;
  itens?: PedidoItem[];
}

export interface PedidoItem {
  id: string;
  /** o SKU vendido: é por ele que a troca sabe o que baixar do estoque */
  product_flavor_id: string | null;
  produto_nome: string;
  sabor_nome: string;
  marca_nome: string | null;
  quantidade: number;
  preco_unitario: number;
  custo_unitario: number;
  subtotal: number;
}

export interface EtapaFunil {
  stage_id: string;
  nome: string;
  slug: string;
  ordem: number;
  cor: string;
  tipo: string;
  leads: number;
  valor: number;
}

export interface Lead {
  id: string;
  customer_id: string | null;
  conversation_id: string | null;
  stage_id: string | null;
  origem: string | null;
  canal: Canal | null;
  valor_estimado: number;
  status: string;
  ordem: number;
  created_at: string;
  /** 1 = primeiro contato do cliente; 2+ = ele voltou */
  numero_atendimento?: number;
  /** preenchido quando o atendimento virou venda */
  order_id?: string | null;
  valor_ganho?: number | null;
  cliente?: Cliente | null;
}

export interface Movimento {
  id: number;
  tipo: MovimentoTipo;
  quantidade: number;
  saldo_anterior: number;
  saldo_posterior: number;
  referencia_tipo: string | null;
  observacao: string | null;
  created_at: string;
  produto?: string;
  sabor?: string;
}

export interface Tarefa {
  id: string;
  titulo: string;
  descricao: string | null;
  prioridade: "baixa" | "media" | "alta" | "urgente";
  status: "aberta" | "em_andamento" | "concluida" | "cancelada";
  vencimento: string | null;
  criada_por: string;
  created_at: string;
}

export interface ResumoEstoque {
  skus: number;
  pecas: number;
  custo_estoque: number;
  valor_venda_potencial: number;
  sem_estoque: number;
  estoque_baixo: number;
}

/* --------------------------------------------------------------- MVP 2 --- */

export interface Cupom {
  id: string;
  codigo: string;
  descricao: string | null;
  tipo_desconto: "valor" | "percentual";
  valor: number;
  inicio: string | null;
  fim: string | null;
  valor_minimo: number;
  limite_total: number | null;
  limite_cliente: number | null;
  usos: number;
  status: "ativo" | "inativo";
  created_at: string;
}

export interface RegraUpsell {
  id: string;
  nome: string;
  produto_origem: string | null;
  produto_destino: string | null;
  produto_origem_nome?: string | null;
  produto_destino_nome?: string | null;
  mensagem: string;
  tipo_desconto: "valor" | "percentual";
  desconto: number;
  prioridade: number;
  status: "ativo" | "inativo";
  exibidas: number;
  aceitas: number;
  faturamento: number;
  created_at: string;
}

export interface Troca {
  /** o produto+sabor que deu defeito (devolvido, não volta ao estoque) */
  product_flavor_id?: string | null;
  /** o produto+sabor entregue na troca — é este que baixa do estoque */
  product_flavor_saida_id?: string | null;
  estoque_aplicado?: boolean;
  id: string;
  customer_id: string | null;
  order_id: string | null;
  cliente_nome: string | null;
  numero_pedido: string | null;
  produto_nome: string | null;
  sabor_nome: string | null;
  quantidade: number;
  motivo: string | null;
  descricao: string | null;
  status: "solicitada" | "em_analise" | "aprovada" | "recusada" | "finalizada";
  created_at: string;
  approved_at: string | null;
  completed_at: string | null;
}

export interface Fornecedor {
  id: string;
  nome: string;
  documento: string | null;
  telefone: string | null;
  email: string | null;
  status: "ativo" | "inativo";
}

export type NotaSituacao = "transito" | "conferencia" | "concluida" | "cancelada";

export interface NotaEntrada {
  id: string;
  supplier_id: string | null;
  fornecedor_nome: string | null;
  numero_documento: string | null;
  data: string;
  valor_total: number;
  observacao: string | null;
  situacao: NotaSituacao;
  estoque_aplicado: boolean;
  /** cotação do dólar quando a compra é importada */
  cotacao: number | null;
  /** percentual do freteiro sobre o total da nota */
  freteiro_pct: number;
  vencimento: string | null;
  itens_count: number;
  pecas: number;
  itens?: NotaItem[];
  created_at: string;
}

export interface NotaItem {
  id: string;
  product_flavor_id: string;
  produto: string;
  sabor: string;
  marca: string | null;
  quantidade: number;
  quantidade_conferida: number | null;
  custo_unitario: number;
  custo_usd: number | null;
  subtotal: number;
}

export interface ContaBancaria {
  id: string;
  nome: string;
  banco: string | null;
  agencia: string | null;
  conta: string | null;
  tipo: string;
  saldo_inicial: number;
  saldo_atual: number;
  status: "ativo" | "inativo";
}

export interface CategoriaFinanceira {
  id: string;
  nome: string;
  tipo: "receita" | "despesa";
  cor: string | null;
  status: "ativo" | "inativo";
  lancamentos: number;
  total: number;
}

export interface Lancamento {
  id: string;
  tipo: "receber" | "pagar";
  descricao: string;
  categoria_id: string | null;
  categoria_nome: string | null;
  contraparte: string | null;
  order_id?: string | null;
  numero_pedido?: string | null;
  valor: number;
  vencimento: string | null;
  pagamento: string | null;
  bank_account_id: string | null;
  conta_nome: string | null;
  forma_pagamento: PagamentoMetodo | null;
  status: "pendente" | "pago" | "cancelado" | "atrasado";
  documento?: string | null;
  observacao?: string | null;
  created_at: string;
}

export interface Usuario {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  cargo: string | null;
  role_slug: string;
  role_nome: string;
  status: "ativo" | "inativo";
  ultimo_login: string | null;
  created_at: string;
}

export interface EventoCalendario {
  id: string;
  titulo: string;
  descricao: string | null;
  tipo: string;
  responsavel: string | null;
  inicio: string;
  fim: string | null;
  recorrencia: string | null;
  cor: string;
  status: "ativo" | "inativo";
}
