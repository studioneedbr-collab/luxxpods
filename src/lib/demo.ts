/**
 * Base de demonstração — espelha exatamente o shape do banco (0006_seed.sql).
 * Usada enquanto as credenciais do Supabase não estiverem configuradas,
 * para que todo o painel fique navegável e testável desde o primeiro minuto.
 */
import type {
  Canal, Cliente, Conversa, ConversaEstado, EtapaFunil, ItemCatalogo, Lead,
  Mensagem, Metricas, Movimento, Pedido, PedidoItem, PedidoStatus, Produto,
  ResumoEstoque, SeriePonto, Tarefa,
} from "./types";

/** Espelha a tabela `jobs` — a fila também roda na demonstração. */
interface JobDemo {
  id: number;
  tipo: string;
  payload: Record<string, unknown>;
  conversation_id: string | null;
  executar_em: string;
  status: "pendente" | "processando" | "concluido" | "cancelado" | "erro";
  tentativas: number;
  erro: string | null;
}

function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MARCAS: string[] = ["Ignite", "Elfbar", "Lost Mary", "Oxbar", "Nikbar", "Elfworld"];

const MODELOS: Array<[string, string, string, number, number, number]> = [
  ["Ignite", "Ignite V300", "V300", 3000, 89.9, 45],
  ["Ignite", "Ignite V600", "V600", 6000, 109.9, 58],
  ["Ignite", "Ignite V150", "V150", 1500, 69.9, 34],
  ["Elfbar", "Elfbar BC10000", "BC10000", 10000, 139.9, 72],
  ["Elfbar", "Elfbar BC5000", "BC5000", 5000, 99.9, 52],
  ["Lost Mary", "Lost Mary MO20000", "MO20000", 20000, 179.9, 95],
  ["Lost Mary", "Lost Mary OS5000", "OS5000", 5000, 104.9, 55],
  ["Oxbar", "Oxbar Magic Maze 30K", "Magic Maze", 30000, 219.9, 120],
  ["Nikbar", "Nikbar 12000", "NB12000", 12000, 149.9, 78],
  ["Elfworld", "Elfworld 15000", "EW15000", 15000, 159.9, 84],
];

const SABORES = [
  "Watermelon Ice", "Strawberry Kiwi", "Blueberry Ice", "Mango Peach", "Grape Ice",
  "Cherry Cola", "Banana Ice", "Passion Fruit", "Pink Lemonade", "Triple Berry",
  "Peach Mango", "Blue Razz Ice", "Mint", "Coconut Melon", "Strawberry Banana",
  "Kiwi Passion Guava", "Cool Mint", "Lush Ice", "Energy Drink", "Tropical Rainbow",
];

const NOMES = [
  "Ana Beatriz", "Carlos Eduardo", "Mariana Alves", "Pedro Henrique", "Juliana Costa",
  "Rafael Lima", "Beatriz Souza", "Lucas Martins", "Fernanda Rocha", "Gabriel Santos",
  "Camila Ferreira", "Thiago Ribeiro", "Larissa Dias", "Bruno Carvalho", "Isabela Nunes",
  "Matheus Pereira", "Amanda Barbosa", "Felipe Araujo", "Natália Gomes", "Vinícius Teixeira",
];

const BAIRROS = ["Centro", "Marajoara", "São Jacinto", "Grão Pará", "Felicidade", "Manoel Pimenta"];

export const ETAPAS_FUNIL: Array<{ slug: string; nome: string; cor: string; tipo: string }> = [
  { slug: "novo-lead", nome: "Novo Lead", cor: "#8b5cf6", tipo: "aberto" },
  { slug: "em-atendimento", nome: "Em Atendimento", cor: "#6366f1", tipo: "aberto" },
  { slug: "escolhendo-produto", nome: "Escolhendo Produto", cor: "#0ea5e9", tipo: "aberto" },
  { slug: "aguardando-endereco", nome: "Aguardando Endereço", cor: "#06b6d4", tipo: "aberto" },
  { slug: "aguardando-pagamento", nome: "Aguardando Pagamento", cor: "#f59e0b", tipo: "aberto" },
  { slug: "aguardando-confirmacao", nome: "Aguardando Confirmação", cor: "#f97316", tipo: "aberto" },
  { slug: "pedido-confirmado", nome: "Pedido Confirmado", cor: "#22c55e", tipo: "aberto" },
  { slug: "em-separacao", nome: "Em Separação", cor: "#14b8a6", tipo: "aberto" },
  { slug: "saiu-para-entrega", nome: "Saiu para Entrega", cor: "#3b82f6", tipo: "aberto" },
  { slug: "concluido", nome: "Concluído", cor: "#10b981", tipo: "ganho" },
  { slug: "perdido", nome: "Perdido", cor: "#ef4444", tipo: "perdido" },
];

const MENSAGENS_CLIENTE = [
  "Quero ver os sabores do Ignite V300",
  "Tem Watermelon Ice?",
  "Boa noite, qual o valor?",
  "Já fiz o PIX",
  "Pode entregar hoje?",
  "Quanto fica com a entrega?",
];

const ESTADOS: ConversaEstado[] = [
  "INITIAL", "CATALOG_SENT", "PRODUCT_SELECTION", "CART",
  "ADDRESS", "PAYMENT", "ORDER_CONFIRMED", "COMPLETED",
];

const STATUS_PEDIDO: PedidoStatus[] = [
  "entregue", "entregue", "entregue", "saiu_para_entrega",
  "em_separacao", "confirmado", "aguardando_pagamento", "cancelado",
];

interface Base {
  jobs: JobDemo[];
  catalogo: ItemCatalogo[];
  produtos: Produto[];
  clientes: Cliente[];
  conversas: Conversa[];
  mensagens: Mensagem[];
  leads: Lead[];
  pedidos: Pedido[];
  itens: Record<string, PedidoItem[]>;
  movimentos: Movimento[];
  tarefas: Tarefa[];
}

let base: Base | null = null;

function construir(): Base {
  const r = rng(20260921);
  const agora = Date.now();

  // ---------- CATÁLOGO ----------
  const catalogo: ItemCatalogo[] = [];
  MODELOS.forEach(([marca, nome, modelo, puffs, preco, custo], pi) => {
    const qtdSabores = 6 + (pi % 5);
    // passo ímpar e coprimo com o total: percorre a lista inteira sem repetir
    // (o passo 5 antes ciclava de 4 em 4 e o mesmo sabor entrava duas vezes)
    const passo = 7;
    for (let si = 0; si < qtdSabores; si++) {
      const sabor = SABORES[(pi * 3 + si * passo) % SABORES.length];
      const k = pi + si + 1;
      const estoque = k % 9 === 0 ? 0 : k % 7 === 0 ? 2 : 4 + Math.floor(r() * 26);
      const reservado = estoque > 6 && k % 5 === 0 ? 1 + Math.floor(r() * 2) : 0;
      catalogo.push({
        product_flavor_id: `pf-${pi}-${si}`,
        product_id: `prod-${pi}`,
        brand_id: `brand-${MARCAS.indexOf(marca)}`,
        flavor_id: `flavor-${SABORES.indexOf(sabor)}`,
        sku: `${marca.replace(/\s/g, "").toUpperCase()}-${modelo.replace(/\s/g, "").toUpperCase()}-${si + 1}`,
        produto: nome, modelo, puffs, marca, sabor,
        preco, custo, custo_medio: custo,
        imagem_url: null,
        estoque_total: estoque,
        estoque_reservado: reservado,
        estoque_disponivel: Math.max(0, estoque - reservado),
        estoque_minimo: 3,
        sabor_ativo: true,
        produto_status: "ativo",
        vendavel: estoque - reservado > 0,
      });
    }
  });

  const produtos: Produto[] = MODELOS.map(([marca, nome, modelo, puffs, preco, custo], pi) => {
    const sab = catalogo.filter((c) => c.product_id === `prod-${pi}`);
    return {
      id: `prod-${pi}`, nome, modelo, marca, brand_id: `brand-${MARCAS.indexOf(marca)}`,
      puffs, sku: `${marca.replace(/\s/g, "").toUpperCase()}-${modelo.replace(/\s/g, "").toUpperCase()}`,
      preco, custo, status: "ativo", destaque: pi < 3, imagem_url: null,
      descricao: `${nome} — ${puffs.toLocaleString("pt-BR")} puffs`,
      sabores: sab.length,
      sabores_disponiveis: sab.filter((s) => s.estoque_disponivel > 0).length,
      estoque: sab.reduce((a, s) => a + s.estoque_total, 0),
      margem: preco > 0 ? ((preco - custo) / preco) * 100 : 0,
    };
  });

  // ---------- CLIENTES / CONVERSAS / LEADS / PEDIDOS ----------
  const clientes: Cliente[] = [];
  const conversas: Conversa[] = [];
  const mensagens: Mensagem[] = [];
  const leads: Lead[] = [];
  const pedidos: Pedido[] = [];
  const itens: Record<string, PedidoItem[]> = {};
  const movimentos: Movimento[] = [];

  for (let i = 1; i <= 20; i++) {
    const nome = NOMES[i - 1];
    const canal: Canal = i % 4 === 0 ? "instagram" : "whatsapp";
    const dt = agora - Math.floor(r() * 28 * 864e5);
    const id = `cli-${i}`;

    const cliente: Cliente = {
      id, nome,
      telefone: `33${String(900000000 + i * 137).padStart(9, "0")}`,
      instagram_username: canal === "instagram" ? `@${nome.split(" ")[0].toLowerCase()}` : null,
      canal_origem: canal,
      origem: canal === "instagram" ? "Instagram Direct" : "WhatsApp Orgânico",
      maioridade_validada: true,
      tags: i % 5 === 0 ? ["vip"] : i % 3 === 0 ? ["recorrente"] : [],
      total_pedidos: 0, total_comprado: 0, ticket_medio: 0,
      ultima_compra: null,
      ultima_interacao: new Date(dt + 25 * 6e4).toISOString(),
      created_at: new Date(dt).toISOString(),
      observacoes: null,
    };
    clientes.push(cliente);

    const convId = `conv-${i}`;
    const ultimaMsg = MENSAGENS_CLIENTE[i % MENSAGENS_CLIENTE.length];
    const ultimaEm = new Date(dt + 25 * 6e4).toISOString();
    conversas.push({
      id: convId, customer_id: id, canal,
      estado: ESTADOS[i % ESTADOS.length],
      status: i % 6 === 0 ? "aguardando_cliente" : i % 9 === 0 ? "resolvida" : "aberta",
      bot_ativo: i % 5 !== 0,
      nao_lidas: i % 3 === 0 ? 1 + (i % 3) : 0,
      ultima_mensagem: ultimaMsg,
      ultima_mensagem_em: ultimaEm,
      responsavel_id: i % 5 === 0 ? "user-1" : null,
      created_at: new Date(dt).toISOString(),
      cliente, lead_id: `lead-${i}`,
    });

    const roteiro: Array<[Mensagem["sender_type"], string, number]> = [
      ["cliente", "Boa noite", 0],
      ["bot", `Fala ${nome.split(" ")[0]}! Aqui é da Luxx Pods 🖤 Você já é maior de 18?`, 5e3],
      ["cliente", "sou sim", 3e4],
      ["bot", "Show! Qual modelo você procura? Posso te mandar o catálogo 📲", 38e3],
      ["cliente", ultimaMsg, 15e5],
    ];
    roteiro.forEach(([sender, texto, offset], mi) => {
      mensagens.push({
        id: `msg-${i}-${mi}`, conversation_id: convId,
        sender_type: sender, tipo: "texto", conteudo: texto,
        arquivo_url: null, status: "lida",
        created_at: new Date(dt + offset).toISOString(),
      });
    });

    // só etapas abertas entram no funil; ganho e perdido saem dele
    const etapasAbertas = ETAPAS_FUNIL.filter((e) => e.tipo === "aberto");
    const status = i % 7 === 0 ? "ganho" : i % 11 === 0 ? "perdido" : "aberto";
    leads.push({
      id: `lead-${i}`, customer_id: id, conversation_id: convId,
      stage_id: status === "ganho"
        ? "concluido"
        : status === "perdido"
          ? "perdido"
          : etapasAbertas[i % etapasAbertas.length].slug,
      origem: cliente.origem, canal,
      valor_estimado: 89.9 + (i % 5) * 30,
      status,
      numero_atendimento: i % 3 === 0 ? 2 : 1,
      ordem: i, created_at: new Date(dt).toISOString(), cliente,
    });

    if (i % 5 !== 0) {
      const item = catalogo[(i * 7) % catalogo.length];
      const qtd = 1 + (i % 3);
      const total = item.preco * qtd + 5;
      const status = STATUS_PEDIDO[i % STATUS_PEDIDO.length];
      const pedidoId = `ped-${i}`;
      pedidos.push({
        id: pedidoId,
        numero_pedido: `LX-2026-${String(i).padStart(6, "0")}`,
        cliente_nome: nome, cliente_telefone: cliente.telefone,
        customer_id: id, conversation_id: convId, canal, origem: "bot",
        subtotal: item.preco * qtd, desconto: 0, taxa_entrega: 5,
        total, custo_total: item.custo * qtd,
        forma_pagamento: i % 3 === 0 ? "dinheiro" : "pix",
        status_pagamento: i % 8 === 0 ? "aguardando" : "aprovado",
        status_pedido: status,
        troco_para: i % 3 === 0 ? Math.ceil(total / 50) * 50 : null,
        valor_troco: i % 3 === 0 ? Math.ceil(total / 50) * 50 - total : null,
        observacoes: null,
        endereco_snapshot: {
          bairro: BAIRROS[i % BAIRROS.length],
          rua: `Rua ${["das Flores", "Sete de Setembro", "Getúlio Vargas", "Dr. Luiz Boali", "Frei Dimas"][i % 5]}`,
          numero: String(100 + i * 7),
          cidade: "Teófilo Otoni",
          referencia: "Próximo ao mercado",
        },
        created_at: new Date(dt + 40 * 6e4).toISOString(),
        confirmado_em: new Date(dt + 45 * 6e4).toISOString(),
        entregue_em: status === "entregue" ? new Date(dt + 2 * 36e5).toISOString() : null,
      });
      itens[pedidoId] = [{
        id: `oi-${i}`, product_flavor_id: item.product_flavor_id,
        produto_nome: item.produto, sabor_nome: item.sabor,
        marca_nome: item.marca, quantidade: qtd,
        preco_unitario: item.preco, custo_unitario: item.custo,
        subtotal: item.preco * qtd,
      }];
      if (status !== "cancelado") {
        cliente.total_pedidos += 1;
        cliente.total_comprado += total;
        cliente.ticket_medio = cliente.total_comprado / cliente.total_pedidos;
        cliente.ultima_compra = new Date(dt + 40 * 6e4).toISOString();
        movimentos.push({
          id: 1000 + i, tipo: "venda", quantidade: qtd,
          saldo_anterior: item.estoque_total + qtd, saldo_posterior: item.estoque_total,
          referencia_tipo: "order", observacao: `Baixa pedido LX-2026-${String(i).padStart(6, "0")}`,
          created_at: new Date(dt + 45 * 6e4).toISOString(),
          produto: item.produto, sabor: item.sabor,
        });
      }
    }
  }

  catalogo.slice(0, 14).forEach((c, k) => {
    movimentos.push({
      id: 500 + k, tipo: "entrada", quantidade: c.estoque_total,
      saldo_anterior: 0, saldo_posterior: c.estoque_total,
      referencia_tipo: "nota_entrada", observacao: "Carga inicial de estoque",
      created_at: new Date(agora - (30 - k) * 864e5).toISOString(),
      produto: c.produto, sabor: c.sabor,
    });
  });
  movimentos.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));

  const tarefas: Tarefa[] = [
    { id: "task-1", titulo: "Cliente pediu atendente humano", descricao: "Conversa com dúvida sobre troca de produto", prioridade: "alta", status: "aberta", vencimento: new Date(agora + 864e5).toISOString(), criada_por: "bot", created_at: new Date(agora - 36e5).toISOString() },
    { id: "task-2", titulo: "Estoque baixo em 3 SKUs", descricao: "Conferir reposição junto ao fornecedor", prioridade: "media", status: "aberta", vencimento: new Date(agora + 2 * 864e5).toISOString(), criada_por: "sistema", created_at: new Date(agora - 72e5).toISOString() },
    { id: "task-3", titulo: "Conferência de caixa", descricao: "Fechamento diário", prioridade: "media", status: "aberta", vencimento: new Date(agora + 36e5).toISOString(), criada_por: "usuario", created_at: new Date(agora - 108e5).toISOString() },
  ];

  return {
    jobs: [], catalogo, produtos, clientes, conversas, mensagens, leads,
    pedidos, itens, movimentos, tarefas,
  };
}

export function demo(): Base {
  if (!base) base = construir();
  return base;
}

// ---------------------------------------------------------------------------
// Consultas (mesma assinatura das funções do banco)
// ---------------------------------------------------------------------------

export function demoMetricas(inicio: Date, fim: Date): Metricas {
  const d = demo();
  const dentro = (s: string | null) => !!s && +new Date(s) >= +inicio && +new Date(s) <= +fim;
  const ped = d.pedidos.filter((p) => dentro(p.created_at));
  const validos = ped.filter((p) => p.status_pedido !== "cancelado");
  const lds = d.leads.filter((l) => dentro(l.created_at));
  const convs = d.conversas.filter((c) => dentro(c.created_at));
  const fat = validos.reduce((a, p) => a + p.total, 0);
  const cmv = validos.reduce((a, p) => a + p.custo_total, 0);

  return {
    faturamento: fat,
    cmv,
    lucro_bruto: fat - cmv - validos.reduce((a, p) => a + p.desconto, 0),
    pedidos: validos.length,
    pedidos_cancelados: ped.length - validos.length,
    pedidos_despachados: validos.filter((p) => p.status_pedido === "saiu_para_entrega").length,
    pedidos_entregues: validos.filter((p) => p.status_pedido === "entregue").length,
    ticket_medio: validos.length ? fat / validos.length : 0,
    clientes_novos: d.clientes.filter((c) => dentro(c.created_at)).length,
    clientes_total: d.clientes.length,
    clientes_recorrentes: d.clientes.filter((c) => c.total_pedidos > 1).length,
    leads: lds.length,
    leads_ganhos: lds.filter((l) => l.status === "ganho").length,
    leads_perdidos: lds.filter((l) => l.status === "perdido").length,
    conversas: convs.length,
    conversas_abertas: d.conversas.filter((c) => c.status === "aberta").length,
    conversas_aguardando: d.conversas.filter((c) => c.status === "aguardando_cliente").length,
    conversas_nao_respondidas: d.conversas.filter((c) => c.nao_lidas > 0).length,
    mensagens_recebidas: d.mensagens.filter((m) => m.sender_type === "cliente" && dentro(m.created_at)).length,
    taxa_conversao: lds.length ? (lds.filter((l) => l.status === "ganho").length / lds.length) * 100 : 0,
    taxa_cancelamento: ped.length ? ((ped.length - validos.length) / ped.length) * 100 : 0,
    tempo_primeira_resposta: 0.6,
    faturamento_bot: fat,
  };
}

export function demoSerie(inicio: Date, fim: Date): SeriePonto[] {
  const d = demo();
  const out: SeriePonto[] = [];
  const cur = new Date(inicio); cur.setHours(0, 0, 0, 0);
  const limite = new Date(fim); limite.setHours(23, 59, 59, 999);
  while (cur <= limite) {
    const dia = cur.toISOString().slice(0, 10);
    const ped = d.pedidos.filter((p) => p.created_at.slice(0, 10) === dia && p.status_pedido !== "cancelado");
    out.push({
      dia,
      faturamento: ped.reduce((a, p) => a + p.total, 0),
      pedidos: ped.length,
      leads: d.leads.filter((l) => l.created_at.slice(0, 10) === dia).length,
    });
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

export function demoFunil(): EtapaFunil[] {
  const d = demo();
  return ETAPAS_FUNIL.map((e, i) => {
    const ls = d.leads.filter((l) => l.stage_id === e.slug && l.status === "aberto");
    return {
      stage_id: e.slug, nome: e.nome, slug: e.slug, ordem: i + 1,
      cor: e.cor, tipo: e.tipo, leads: ls.length,
      valor: ls.reduce((a, l) => a + l.valor_estimado, 0),
    };
  });
}

export function demoResumoEstoque(): ResumoEstoque {
  const c = demo().catalogo;
  return {
    skus: c.length,
    pecas: c.reduce((a, x) => a + x.estoque_total, 0),
    custo_estoque: c.reduce((a, x) => a + x.estoque_total * x.custo_medio, 0),
    valor_venda_potencial: c.reduce((a, x) => a + x.estoque_total * x.preco, 0),
    sem_estoque: c.filter((x) => x.estoque_disponivel <= 0).length,
    estoque_baixo: c.filter((x) => x.estoque_disponivel > 0 && x.estoque_disponivel <= x.estoque_minimo).length,
  };
}

// ---------------------------------------------------------------------------
// Mutações da base de demonstração (mesmo efeito das escritas no banco)
// ---------------------------------------------------------------------------

export function demoEnviarMensagem(
  conversationId: string,
  conteudo: string,
  sender: Mensagem["sender_type"] = "atendente",
  /** id no provedor — é por ele que se reconhece a entrega repetida */
  idExterno?: string,
) {
  const d = demo();
  const msg: Mensagem = {
    id: idExterno || `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    conversation_id: conversationId,
    sender_type: sender,
    tipo: "texto",
    conteudo,
    arquivo_url: null,
    status: "enviada",
    created_at: new Date().toISOString(),
  };
  d.mensagens.push(msg);
  const conv = d.conversas.find((c) => c.id === conversationId);
  if (conv) {
    conv.ultima_mensagem = conteudo;
    conv.ultima_mensagem_em = msg.created_at;
    if (sender !== "cliente") conv.nao_lidas = 0;
  }
  return msg;
}

export function demoAlternarBot(conversationId: string, ativo: boolean, responsavel?: string | null) {
  const conv = demo().conversas.find((c) => c.id === conversationId);
  if (!conv) return;
  conv.bot_ativo = ativo;
  conv.responsavel_id = ativo ? null : responsavel ?? "user-1";
  demo().mensagens.push({
    id: `msg-sys-${Date.now()}`,
    conversation_id: conversationId,
    sender_type: "sistema",
    tipo: "sistema",
    conteudo: ativo
      ? "Atendimento devolvido para o bot."
      : "Atendente assumiu a conversa. Bot pausado.",
    arquivo_url: null,
    status: "enviada",
    created_at: new Date().toISOString(),
  });
}

export function demoMarcarLido(conversationId: string) {
  const conv = demo().conversas.find((c) => c.id === conversationId);
  if (conv) conv.nao_lidas = 0;
}

export function demoMoverLead(leadId: string, stageSlug: string) {
  const lead = demo().leads.find((l) => l.id === leadId);
  if (!lead) return;
  lead.stage_id = stageSlug;
  const etapa = ETAPAS_FUNIL.find((e) => e.slug === stageSlug);
  lead.status = etapa?.tipo === "ganho" ? "ganho" : etapa?.tipo === "perdido" ? "perdido" : "aberto";
}

export function demoAlterarStatusPedido(pedidoId: string, status: PedidoStatus) {
  const p = demo().pedidos.find((x) => x.id === pedidoId);
  if (!p) return;
  p.status_pedido = status;
  const agora = new Date().toISOString();
  if (status === "confirmado") p.confirmado_em = agora;
  if (status === "entregue") {
    p.entregue_em = agora;
    if (p.forma_pagamento === "dinheiro") p.status_pagamento = "aprovado";
  }
}

export function demoAjustarEstoque(pfId: string, novoTotal: number, observacao?: string) {
  const item = demo().catalogo.find((c) => c.product_flavor_id === pfId);
  if (!item) return;
  const anterior = item.estoque_total;
  item.estoque_total = Math.max(0, novoTotal);
  item.estoque_disponivel = Math.max(0, item.estoque_total - item.estoque_reservado);
  item.vendavel = item.estoque_disponivel > 0 && item.produto_status === "ativo" && item.sabor_ativo;
  demo().movimentos.unshift({
    id: Date.now(),
    tipo: novoTotal >= anterior ? "ajuste_positivo" : "ajuste_negativo",
    quantidade: Math.abs(novoTotal - anterior),
    saldo_anterior: anterior,
    saldo_posterior: item.estoque_total,
    referencia_tipo: "ajuste_manual",
    observacao: observacao ?? "Ajuste manual pelo painel",
    created_at: new Date().toISOString(),
    produto: item.produto,
    sabor: item.sabor,
  });
  const prod = demo().produtos.find((p) => p.id === item.product_id);
  if (prod) {
    const sab = demo().catalogo.filter((c) => c.product_id === prod.id);
    prod.estoque = sab.reduce((a, s) => a + s.estoque_total, 0);
    prod.sabores_disponiveis = sab.filter((s) => s.estoque_disponivel > 0).length;
  }
}

export function demoAlternarProduto(produtoId: string, ativo: boolean) {
  const prod = demo().produtos.find((p) => p.id === produtoId);
  if (prod) prod.status = ativo ? "ativo" : "inativo";
  demo().catalogo.forEach((c) => {
    if (c.product_id === produtoId) {
      c.produto_status = ativo ? "ativo" : "inativo";
      c.vendavel = ativo && c.sabor_ativo && c.estoque_disponivel > 0;
    }
  });
}

export function demoAlternarSabor(pfId: string, ativo: boolean) {
  const item = demo().catalogo.find((c) => c.product_flavor_id === pfId);
  if (!item) return;
  item.sabor_ativo = ativo;
  item.vendavel = ativo && item.produto_status === "ativo" && item.estoque_disponivel > 0;
}

export function demoSalvarProduto(id: string, dados: Partial<Produto>) {
  const prod = demo().produtos.find((p) => p.id === id);
  if (!prod) return;
  Object.assign(prod, dados);
  prod.margem = prod.preco > 0 ? ((prod.preco - prod.custo) / prod.preco) * 100 : 0;
  demo().catalogo.forEach((c) => {
    if (c.product_id === id) {
      if (dados.preco !== undefined) c.preco = dados.preco;
      if (dados.custo !== undefined) { c.custo = dados.custo; c.custo_medio = dados.custo; }
    }
  });
}


/** Venda fechada: o atendimento sai do funil (espelha o trigger do banco). */
export function demoFecharLeadDoPedido(pedidoId: string) {
  const d = demo();
  const pedido = d.pedidos.find((p) => p.id === pedidoId);
  if (!pedido) return;
  const lead = d.leads.find((l) => l.conversation_id === pedido.conversation_id);
  if (!lead || lead.status === "ganho") return;
  lead.status = "ganho";
  lead.stage_id = "concluido";
  lead.order_id = pedido.id;
  lead.valor_ganho = pedido.total;
}

/** Pedido cancelado: o atendimento volta para a fila. */
export function demoReabrirLeadDoPedido(pedidoId: string) {
  const d = demo();
  const pedido = d.pedidos.find((p) => p.id === pedidoId);
  if (!pedido) return;
  const lead = d.leads.find((l) => l.conversation_id === pedido.conversation_id);
  if (!lead || lead.status !== "ganho") return;
  lead.status = "aberto";
  lead.stage_id = "em-atendimento";
  lead.order_id = null;
  lead.valor_ganho = null;
}

/**
 * Cliente voltou a chamar depois de um atendimento fechado: abre um novo,
 * numerado, na primeira coluna do funil.
 */
export function demoAbrirAtendimento(conversationId: string): Lead | null {
  const d = demo();
  const aberto = d.leads.find(
    (l) => l.conversation_id === conversationId && l.status === "aberto");
  if (aberto) return aberto;

  const conversa = d.conversas.find((c) => c.id === conversationId);
  if (!conversa) return null;

  const anteriores = d.leads.filter((l) => l.customer_id === conversa.customer_id);
  const novo: Lead = {
    id: `lead-${Date.now()}`,
    customer_id: conversa.customer_id,
    conversation_id: conversationId,
    stage_id: ETAPAS_FUNIL.find((e) => e.tipo === "aberto")!.slug,
    origem: "Retorno do cliente",
    canal: conversa.canal,
    valor_estimado: 0,
    status: "aberto",
    numero_atendimento: anteriores.length + 1,
    ordem: d.leads.length + 1,
    created_at: new Date().toISOString(),
    cliente: conversa.cliente ?? null,
  };
  d.leads.push(novo);
  conversa.lead_id = novo.id;
  conversa.estado = "INITIAL";
  return novo;
}


/** Status atual do pedido na base de demonstração, para validar a transição. */
export function demoStatusPedido(pedidoId: string): PedidoStatus | null {
  return demo().pedidos.find((p) => p.id === pedidoId)?.status_pedido ?? null;
}

/** Cria o pedido na base de demonstração, com a mesma checagem de estoque. */
export function demoCriarPedido(dados: {
  customer_id: string | null;
  conversation_id: string | null;
  address_id: string | null;
  endereco?: { bairro: string; rua: string; numero: string; complemento?: string; referencia?: string };
  itens: Array<{ product_flavor_id: string; quantidade: number }>;
  forma_pagamento: "pix" | "dinheiro";
  troco_para?: number | null;
  observacoes?: string | null;
}): { ok: boolean; erro?: string; id?: string; numero?: string } {
  const d = demo();

  // confere o estoque de tudo ANTES de gravar qualquer coisa
  for (const item of dados.itens) {
    const c = d.catalogo.find((x) => x.product_flavor_id === item.product_flavor_id);
    if (!c) return { ok: false, erro: "Produto não encontrado no catálogo." };
    if (!c.vendavel) return { ok: false, erro: `${c.produto} · ${c.sabor} não está disponível.` };
    if (c.estoque_disponivel < item.quantidade) {
      return {
        ok: false,
        erro: `${c.produto} · ${c.sabor}: só tem ${c.estoque_disponivel} disponível.`,
      };
    }
  }

  const cliente = d.clientes.find((x) => x.id === dados.customer_id);
  const numero = `LX-${new Date().getFullYear()}-${String(d.pedidos.length + 1).padStart(6, "0")}`;
  const id = `ped-${Date.now()}`;

  const itens: PedidoItem[] = dados.itens.map((item, i) => {
    const c = d.catalogo.find((x) => x.product_flavor_id === item.product_flavor_id)!;
    return {
      id: `oi-${id}-${i}`,
      product_flavor_id: item.product_flavor_id,
      produto_nome: c.produto, sabor_nome: c.sabor, marca_nome: c.marca,
      quantidade: item.quantidade,
      preco_unitario: c.preco, custo_unitario: c.custo_medio,
      subtotal: c.preco * item.quantidade,
    };
  });

  const subtotal = itens.reduce((a, i) => a + i.subtotal, 0);
  const entrega = subtotal >= 150 ? 0 : 5;
  const total = subtotal + entrega;

  const pedido: Pedido = {
    id, numero_pedido: numero,
    cliente_nome: cliente?.nome ?? "Cliente avulso",
    cliente_telefone: cliente?.telefone ?? null,
    customer_id: dados.customer_id,
    conversation_id: dados.conversation_id,
    canal: dados.conversation_id ? "whatsapp" : "manual",
    origem: dados.conversation_id ? "bot" : "operador",
    subtotal, desconto: 0, taxa_entrega: entrega, total,
    custo_total: itens.reduce((a, i) => a + i.custo_unitario * i.quantidade, 0),
    forma_pagamento: dados.forma_pagamento,
    status_pagamento: "aguardando",
    // dinheiro já pode separar; PIX espera o pagamento cair
    status_pedido: dados.forma_pagamento === "dinheiro" ? "confirmado" : "aguardando_pagamento",
    troco_para: dados.troco_para ?? null,
    valor_troco: dados.troco_para ? dados.troco_para - total : null,
    observacoes: dados.observacoes ?? null,
    endereco_snapshot: dados.endereco
      ? { ...dados.endereco, cidade: "Teófilo Otoni" }
      : { bairro: "Centro", rua: "—", numero: "—", cidade: "Teófilo Otoni" },
    created_at: new Date().toISOString(),
    confirmado_em: dados.forma_pagamento === "dinheiro" ? new Date().toISOString() : null,
    entregue_em: null,
    itens,
  };

  d.pedidos.unshift(pedido);
  d.itens[id] = itens;

  // baixa o estoque com histórico, como a função do banco faria
  dados.itens.forEach((item) => {
    const c = d.catalogo.find((x) => x.product_flavor_id === item.product_flavor_id)!;
    demoAjustarEstoque(item.product_flavor_id, c.estoque_total - item.quantidade,
      `Venda ${numero}`);
  });

  if (cliente) {
    cliente.total_pedidos += 1;
    cliente.total_comprado += total;
    cliente.ticket_medio = cliente.total_comprado / cliente.total_pedidos;
    cliente.ultima_compra = pedido.created_at;
  }

  return { ok: true, id, numero };
}

/* ---------------------------------------------------------------- CADASTRO
 * As mesmas regras que o banco aplica, para a base de demonstração não
 * aceitar o que o banco recusaria — e a equipe não aprender um fluxo que
 * vai mudar quando o Supabase entrar.
 * ------------------------------------------------------------------------ */

const identificador = (prefixo: string) =>
  `${prefixo}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export function demoCriarProduto(dados: {
  nome: string; modelo?: string | null; brand_id?: string | null;
  puffs?: number | null; sku?: string | null; preco: number; custo: number;
  descricao?: string | null; destaque?: boolean;
}): { ok: boolean; erro?: string; id?: string } {
  const d = demo();
  if (d.produtos.some((p) => p.nome.toLowerCase() === dados.nome.trim().toLowerCase())) {
    return { ok: false, erro: "Já existe um produto com esse nome." };
  }

  const id = identificador("prod");
  const marca = dados.brand_id
    ? MARCAS[Number(dados.brand_id.replace("brand-", ""))] ?? null
    : null;

  d.produtos.push({
    id,
    nome: dados.nome.trim(),
    modelo: dados.modelo ?? null,
    marca,
    brand_id: dados.brand_id ?? null,
    puffs: dados.puffs ?? null,
    sku: dados.sku ?? null,
    preco: dados.preco,
    custo: dados.custo,
    status: "ativo",
    destaque: dados.destaque ?? false,
    imagem_url: null,
    descricao: dados.descricao ?? null,
    sabores: 0,
    sabores_disponiveis: 0,
    estoque: 0,
    margem: dados.preco > 0 ? ((dados.preco - dados.custo) / dados.preco) * 100 : 0,
  });

  return { ok: true, id };
}

export function demoExcluirProduto(id: string): { ok: boolean; erro?: string } {
  const d = demo();
  const emCasa = d.catalogo
    .filter((c) => c.product_id === id)
    .reduce((a, c) => a + c.estoque_total, 0);

  if (emCasa > 0) {
    return {
      ok: false,
      erro: `Ainda há ${emCasa} unidade(s) em estoque. Zere o estoque ou desative o produto.`,
    };
  }

  d.produtos = d.produtos.filter((p) => p.id !== id);
  d.catalogo = d.catalogo.filter((c) => c.product_id !== id);
  return { ok: true };
}

export function demoSalvarMarca(dados: { id?: string; nome: string }): {
  ok: boolean; erro?: string; id?: string;
} {
  const d = demo();
  const nome = dados.nome.trim();

  if (dados.id) {
    d.produtos.forEach((p) => { if (p.brand_id === dados.id) p.marca = nome; });
    d.catalogo.forEach((c) => { if (c.brand_id === dados.id) c.marca = nome; });
    return { ok: true, id: dados.id };
  }

  if (MARCAS.some((m) => m.toLowerCase() === nome.toLowerCase())) {
    return { ok: false, erro: "Esta marca já existe." };
  }
  MARCAS.push(nome);
  return { ok: true, id: `brand-${MARCAS.length - 1}` };
}

export function demoExcluirMarca(id: string): { ok: boolean; erro?: string } {
  const d = demo();
  const usados = d.produtos.filter((p) => p.brand_id === id).length;
  if (usados > 0) {
    return { ok: false, erro: `A marca ainda tem ${usados} produto(s). Mova ou exclua antes.` };
  }
  return { ok: true };
}

export function demoCriarSabor(
  produtoId: string, nomeSabor: string, estoqueMinimo = 3,
): { ok: boolean; erro?: string; id?: string } {
  const d = demo();
  const produto = d.produtos.find((p) => p.id === produtoId);
  if (!produto) return { ok: false, erro: "Produto não encontrado." };

  const jaTem = d.catalogo.some(
    (c) => c.product_id === produtoId &&
           c.sabor.toLowerCase() === nomeSabor.toLowerCase());
  if (jaTem) return { ok: false, erro: "Este produto já tem esse sabor." };

  const id = identificador("pf");
  d.catalogo.push({
    product_flavor_id: id,
    product_id: produtoId,
    brand_id: produto.brand_id,
    flavor_id: identificador("flavor"),
    sku: `${(produto.marca ?? "").replace(/\s/g, "").toUpperCase()}-${nomeSabor.slice(0, 3).toUpperCase()}`,
    produto: produto.nome,
    modelo: produto.modelo,
    puffs: produto.puffs,
    marca: produto.marca,
    sabor: nomeSabor,
    preco: produto.preco,
    custo: produto.custo,
    custo_medio: produto.custo,
    imagem_url: null,
    estoque_total: 0,
    estoque_reservado: 0,
    estoque_disponivel: 0,
    estoque_minimo: estoqueMinimo,
    sabor_ativo: true,
    produto_status: produto.status,
    vendavel: false,
  });

  produto.sabores += 1;
  return { ok: true, id };
}

export function demoExcluirSabor(pfId: string): { ok: boolean; erro?: string } {
  const d = demo();
  const item = d.catalogo.find((c) => c.product_flavor_id === pfId);
  if (!item) return { ok: true };

  if (item.estoque_total > 0) {
    return {
      ok: false,
      erro: `Ainda há ${item.estoque_total} unidade(s) deste sabor. Zere o estoque ou desative.`,
    };
  }

  d.catalogo = d.catalogo.filter((c) => c.product_flavor_id !== pfId);
  const produto = d.produtos.find((p) => p.id === item.product_id);
  if (produto) {
    const sab = d.catalogo.filter((c) => c.product_id === produto.id);
    produto.sabores = sab.length;
    produto.sabores_disponiveis = sab.filter((s) => s.estoque_disponivel > 0).length;
  }
  return { ok: true };
}

export function demoSalvarCliente(dados: {
  id?: string; nome: string; telefone?: string | null; email?: string | null;
  instagram_username?: string | null; maioridade_validada?: boolean;
  tags?: string[]; observacoes?: string | null;
}): { ok: boolean; erro?: string; id?: string } {
  const d = demo();
  const telefone = dados.telefone?.replace(/\D/g, "") || null;

  const duplicado = telefone && d.clientes.some(
    (c) => c.telefone?.replace(/\D/g, "") === telefone && c.id !== dados.id);
  if (duplicado) return { ok: false, erro: "Já existe um cliente com este telefone." };

  if (dados.id) {
    const cliente = d.clientes.find((c) => c.id === dados.id);
    if (!cliente) return { ok: false, erro: "Cliente não encontrado." };
    Object.assign(cliente, {
      nome: dados.nome.trim(),
      telefone,
      instagram_username: dados.instagram_username ?? cliente.instagram_username,
      maioridade_validada: dados.maioridade_validada ?? cliente.maioridade_validada,
      tags: dados.tags ?? cliente.tags,
      observacoes: dados.observacoes ?? cliente.observacoes,
    });
    return { ok: true, id: cliente.id };
  }

  const id = identificador("cli");
  d.clientes.unshift({
    id,
    nome: dados.nome.trim(),
    telefone,
    instagram_username: dados.instagram_username ?? null,
    canal_origem: "manual",
    origem: "Cadastro manual",
    maioridade_validada: dados.maioridade_validada ?? false,
    tags: dados.tags ?? [],
    total_pedidos: 0,
    total_comprado: 0,
    ticket_medio: 0,
    ultima_compra: null,
    ultima_interacao: new Date().toISOString(),
    created_at: new Date().toISOString(),
    observacoes: dados.observacoes ?? null,
  });
  return { ok: true, id };
}

export function demoExcluirCliente(id: string): { ok: boolean; erro?: string } {
  const d = demo();
  const pedidos = d.pedidos.filter((p) => p.customer_id === id).length;
  if (pedidos > 0) {
    return {
      ok: false,
      erro: `Este cliente tem ${pedidos} pedido(s). O histórico de venda não pode ser apagado.`,
    };
  }

  d.clientes = d.clientes.filter((c) => c.id !== id);
  d.conversas = d.conversas.filter((c) => c.customer_id !== id);
  d.leads = d.leads.filter((l) => l.customer_id !== id);
  return { ok: true };
}

/** Conversa que originou o pedido — usada para avisar o cliente do status. */
export function demoConversaDoPedido(pedidoId: string): string | null {
  return demo().pedidos.find((p) => p.id === pedidoId)?.conversation_id ?? null;
}
