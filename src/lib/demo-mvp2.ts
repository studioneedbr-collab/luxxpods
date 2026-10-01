/**
 * Base de demonstração dos módulos do MVP 2.
 * Mesmo shape das tabelas do banco, com mutações em memória — para as telas
 * ficarem plenamente utilizáveis antes do Supabase estar conectado.
 */
import { demo } from "./demo";
import type {
  CategoriaFinanceira, ContaBancaria, Cupom, EventoCalendario, Fornecedor,
  Lancamento, NotaEntrada, RegraUpsell, Tarefa, Troca, Usuario,
} from "./types";

const uid = (p: string) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const dias = (n: number) => new Date(Date.now() + n * 864e5).toISOString();
const dataISO = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

interface BaseMvp2 {
  cupons: Cupom[];
  upsell: RegraUpsell[];
  trocas: Troca[];
  fornecedores: Fornecedor[];
  notas: NotaEntrada[];
  contas: ContaBancaria[];
  categorias: CategoriaFinanceira[];
  lancamentos: Lancamento[];
  usuarios: Usuario[];
  eventos: EventoCalendario[];
}

let base: BaseMvp2 | null = null;

function construir(): BaseMvp2 {
  const d = demo();
  const pedidos = d.pedidos;

  const cupons: Cupom[] = [
    { id: "cup-1", codigo: "LUXX10", descricao: "10% na primeira compra",
      tipo_desconto: "percentual", valor: 10, inicio: null, fim: null,
      valor_minimo: 80, limite_total: 500, limite_cliente: 1, usos: 37,
      status: "ativo", created_at: dias(-40) },
    { id: "cup-2", codigo: "FRETEGRATIS", descricao: "Entrega grátis acima de R$ 120",
      tipo_desconto: "valor", valor: 5, inicio: null, fim: null,
      valor_minimo: 120, limite_total: null, limite_cliente: null, usos: 112,
      status: "ativo", created_at: dias(-30) },
    { id: "cup-3", codigo: "VOLTA15", descricao: "R$ 15 para cliente inativo há 30 dias",
      tipo_desconto: "valor", valor: 15, inicio: dias(-10), fim: dias(20),
      valor_minimo: 90, limite_total: 200, limite_cliente: 1, usos: 8,
      status: "ativo", created_at: dias(-10) },
  ];

  const prods = d.produtos;
  const upsell: RegraUpsell[] = [
    { id: "ups-1", nome: "Leve 2 Ignite V300",
      produto_origem: prods[0]?.id ?? null, produto_destino: prods[0]?.id ?? null,
      produto_origem_nome: prods[0]?.nome ?? null, produto_destino_nome: prods[0]?.nome ?? null,
      mensagem: "Quer aproveitar e levar mais uma unidade com R$ 15 de desconto? 🖤",
      tipo_desconto: "valor", desconto: 15, prioridade: 1, status: "ativo",
      exibidas: 84, aceitas: 23, faturamento: 1723.7, created_at: dias(-25) },
    { id: "ups-2", nome: "Upgrade Elfbar BC5000 → BC10000",
      produto_origem: prods[4]?.id ?? null, produto_destino: prods[3]?.id ?? null,
      produto_origem_nome: prods[4]?.nome ?? null, produto_destino_nome: prods[3]?.nome ?? null,
      mensagem: "Por R$ 25 a mais você leva o de 10.000 puffs — dura o dobro. Quer trocar?",
      tipo_desconto: "valor", desconto: 15, prioridade: 2, status: "ativo",
      exibidas: 52, aceitas: 19, faturamento: 2658.1, created_at: dias(-18) },
    { id: "ups-3", nome: "Segunda unidade com 10%",
      produto_origem: prods[5]?.id ?? null, produto_destino: prods[5]?.id ?? null,
      produto_origem_nome: prods[5]?.nome ?? null, produto_destino_nome: prods[5]?.nome ?? null,
      mensagem: "Leva mais um com 10% de desconto?",
      tipo_desconto: "percentual", desconto: 10, prioridade: 3, status: "inativo",
      exibidas: 31, aceitas: 4, faturamento: 647.6, created_at: dias(-12) },
  ];

  const trocas: Troca[] = pedidos.slice(0, 3).map((p, i) => {
    const item = d.itens[p.id]?.[0];
    const status = (["solicitada", "em_analise", "finalizada"] as const)[i];
    return {
      id: `tro-${i + 1}`,
      customer_id: p.customer_id, order_id: p.id,
      cliente_nome: p.cliente_nome, numero_pedido: p.numero_pedido,
      produto_nome: item?.produto_nome ?? null, sabor_nome: item?.sabor_nome ?? null,
      quantidade: 1,
      motivo: ["Produto não liga", "Sabor veio diferente do pedido", "Vazando"][i],
      descricao: ["Cliente relata que o pod não acende desde a primeira tragada.",
        "Veio Mint no lugar de Watermelon Ice.",
        "Vazou líquido na embalagem."][i],
      status,
      created_at: dias(-(i + 2)),
      approved_at: status === "finalizada" ? dias(-1) : null,
      completed_at: status === "finalizada" ? dias(-1) : null,
    };
  });

  const fornecedores: Fornecedor[] = [
    { id: "for-1", nome: "Distribuidora Vapor SP", documento: "12.345.678/0001-90",
      telefone: "11987654321", email: "vendas@vaporsp.com.br", status: "ativo" },
    { id: "for-2", nome: "Import Pods BH", documento: "98.765.432/0001-10",
      telefone: "31912345678", email: "comercial@importpods.com.br", status: "ativo" },
  ];

  const notas: NotaEntrada[] = [
    { id: "not-1", supplier_id: "for-1", fornecedor_nome: "Distribuidora Vapor SP",
      numero_documento: "NF 10482", data: dataISO(-14), valor_total: 6840,
      observacao: "Reposição mensal", situacao: "concluida", estoque_aplicado: true,
      cotacao: null, freteiro_pct: 4, vencimento: dataISO(-4),
      itens_count: 12, pecas: 120, created_at: dias(-14) },
    { id: "not-2", supplier_id: "for-2", fornecedor_nome: "Import Pods BH",
      numero_documento: "NF 3391", data: dataISO(-5), valor_total: 3150,
      observacao: null, situacao: "conferencia", estoque_aplicado: false,
      cotacao: 5.42, freteiro_pct: 0, vencimento: dataISO(10),
      itens_count: 6, pecas: 45, created_at: dias(-5) },
    { id: "not-3", supplier_id: "for-1", fornecedor_nome: "Distribuidora Vapor SP",
      numero_documento: "NF 10620", data: dataISO(0), valor_total: 2480,
      observacao: "Chega na quinta pela transportadora", situacao: "transito",
      estoque_aplicado: false, cotacao: null, freteiro_pct: 4,
      vencimento: dataISO(20), itens_count: 4, pecas: 60, created_at: dias(0) },
  ];

  const contas: ContaBancaria[] = [
    { id: "ban-1", nome: "Conta Principal", banco: "Nubank", agencia: "0001",
      conta: "12345678-9", tipo: "corrente", saldo_inicial: 0, saldo_atual: 0, status: "ativo" },
    { id: "ban-2", nome: "Caixa Loja", banco: "Dinheiro", agencia: null,
      conta: null, tipo: "caixa", saldo_inicial: 300, saldo_atual: 300, status: "ativo" },
  ];

  const categorias: CategoriaFinanceira[] = [
    { id: "cat-r1", nome: "Vendas", tipo: "receita", cor: "#34d399", status: "ativo", lancamentos: 0, total: 0 },
    ...["Mercadoria", "Aluguel", "Funcionários", "Marketing", "Motoboy", "Sistemas", "Energia", "Internet", "Outros"]
      .map((nome, i) => ({
        id: `cat-d${i + 1}`, nome, tipo: "despesa" as const,
        cor: ["#f87171", "#fbbf24", "#38bdf8", "#c084fc", "#22d3ee", "#9563ff", "#f5c451", "#6366f1", "#9a9ab5"][i],
        status: "ativo" as const, lancamentos: 0, total: 0,
      })),
  ];

  // contas a receber: geradas pelos pedidos
  const receber: Lancamento[] = pedidos
    .filter((p) => p.status_pedido !== "cancelado")
    .map((p) => ({
      id: `rec-${p.id}`, tipo: "receber" as const,
      descricao: `Venda ${p.numero_pedido}`,
      categoria_id: "cat-r1", categoria_nome: "Vendas",
      contraparte: p.cliente_nome, order_id: p.id, numero_pedido: p.numero_pedido,
      valor: p.total,
      vencimento: p.created_at.slice(0, 10),
      pagamento: p.status_pagamento === "aprovado" ? p.created_at.slice(0, 10) : null,
      bank_account_id: p.forma_pagamento === "dinheiro" ? "ban-2" : "ban-1",
      conta_nome: p.forma_pagamento === "dinheiro" ? "Caixa Loja" : "Conta Principal",
      forma_pagamento: p.forma_pagamento,
      status: p.status_pagamento === "aprovado" ? ("pago" as const) : ("pendente" as const),
      created_at: p.created_at,
    }));

  const pagar: Lancamento[] = [
    { id: "pag-1", tipo: "pagar", descricao: "NF 10482 — Distribuidora Vapor SP",
      categoria_id: "cat-d1", categoria_nome: "Mercadoria", contraparte: "Distribuidora Vapor SP",
      valor: 6840, vencimento: dataISO(-4), pagamento: dataISO(-4),
      bank_account_id: "ban-1", conta_nome: "Conta Principal", forma_pagamento: "pix",
      status: "pago", documento: "NF 10482", observacao: null, created_at: dias(-14) },
    { id: "pag-2", tipo: "pagar", descricao: "NF 3391 — Import Pods BH",
      categoria_id: "cat-d1", categoria_nome: "Mercadoria", contraparte: "Import Pods BH",
      valor: 3150, vencimento: dataISO(5), pagamento: null,
      bank_account_id: "ban-1", conta_nome: "Conta Principal", forma_pagamento: "pix",
      status: "pendente", documento: "NF 3391", observacao: null, created_at: dias(-5) },
    { id: "pag-3", tipo: "pagar", descricao: "Aluguel da loja",
      categoria_id: "cat-d2", categoria_nome: "Aluguel", contraparte: "Imobiliária Centro",
      valor: 1800, vencimento: dataISO(8), pagamento: null,
      bank_account_id: "ban-1", conta_nome: "Conta Principal", forma_pagamento: "transferencia",
      status: "pendente", documento: null, observacao: "Todo dia 10", created_at: dias(-20) },
    { id: "pag-4", tipo: "pagar", descricao: "Motoboy — semana",
      categoria_id: "cat-d5", categoria_nome: "Motoboy", contraparte: "João Entregas",
      valor: 620, vencimento: dataISO(-2), pagamento: null,
      bank_account_id: "ban-2", conta_nome: "Caixa Loja", forma_pagamento: "dinheiro",
      status: "atrasado", documento: null, observacao: null, created_at: dias(-9) },
    { id: "pag-5", tipo: "pagar", descricao: "Tráfego pago — Instagram",
      categoria_id: "cat-d4", categoria_nome: "Marketing", contraparte: "Meta Platforms",
      valor: 450, vencimento: dataISO(3), pagamento: null,
      bank_account_id: "ban-1", conta_nome: "Conta Principal", forma_pagamento: "cartao_credito",
      status: "pendente", documento: null, observacao: null, created_at: dias(-6) },
    { id: "pag-6", tipo: "pagar", descricao: "Internet da loja",
      categoria_id: "cat-d8", categoria_nome: "Internet", contraparte: "Vivo Fibra",
      valor: 129.9, vencimento: dataISO(12), pagamento: null,
      bank_account_id: "ban-1", conta_nome: "Conta Principal", forma_pagamento: "pix",
      status: "pendente", documento: null, observacao: null, created_at: dias(-3) },
  ];

  const usuarios: Usuario[] = [
    { id: "usr-1", nome: "Cássio", email: "studioneedbr@gmail.com", telefone: "33999990000",
      cargo: "Proprietário", role_slug: "admin", role_nome: "Administrador",
      status: "ativo", ultimo_login: dias(0), created_at: dias(-60) },
    { id: "usr-2", nome: "Equipe Atendimento", email: null, telefone: null,
      cargo: "Atendente", role_slug: "atendimento", role_nome: "Atendimento",
      status: "ativo", ultimo_login: dias(-1), created_at: dias(-30) },
  ];

  const eventos: EventoCalendario[] = [
    { id: "eve-1", titulo: "Conferência de estoque", descricao: "Contagem completa do inventário",
      tipo: "rotina", responsavel: "Operacional", inicio: `${dataISO(0)}T11:00:00`,
      fim: `${dataISO(0)}T12:00:00`, recorrencia: "semanal", cor: "#9563ff", status: "ativo" },
    { id: "eve-2", titulo: "Compra de mercadoria", descricao: "Pedido ao fornecedor",
      tipo: "rotina", responsavel: "Administrador", inicio: `${dataISO(0)}T14:00:00`,
      fim: `${dataISO(0)}T15:00:00`, recorrencia: "quinzenal", cor: "#38bdf8", status: "ativo" },
    { id: "eve-3", titulo: "Conferência de caixa", descricao: "Fechamento do caixa do dia",
      tipo: "rotina", responsavel: "Financeiro", inicio: `${dataISO(0)}T21:00:00`,
      fim: `${dataISO(0)}T21:30:00`, recorrencia: "diaria", cor: "#fbbf24", status: "ativo" },
    { id: "eve-4", titulo: "Fechamento financeiro", descricao: "Conciliação de entradas e saídas",
      tipo: "rotina", responsavel: "Financeiro", inicio: `${dataISO(0)}T22:00:00`,
      fim: `${dataISO(0)}T22:30:00`, recorrencia: "diaria", cor: "#34d399", status: "ativo" },
  ];

  // consolida contadores das categorias
  const todos = [...receber, ...pagar];
  categorias.forEach((c) => {
    const l = todos.filter((x) => x.categoria_id === c.id);
    c.lancamentos = l.length;
    c.total = l.reduce((a, x) => a + x.valor, 0);
  });

  // saldo das contas
  contas.forEach((c) => {
    const entra = receber.filter((l) => l.bank_account_id === c.id && l.status === "pago")
      .reduce((a, l) => a + l.valor, 0);
    const sai = pagar.filter((l) => l.bank_account_id === c.id && l.status === "pago")
      .reduce((a, l) => a + l.valor, 0);
    c.saldo_atual = c.saldo_inicial + entra - sai;
  });

  return {
    cupons, upsell, trocas, fornecedores, notas, contas, categorias,
    lancamentos: [...receber, ...pagar], usuarios, eventos,
  };
}

export function demo2(): BaseMvp2 {
  if (!base) base = construir();
  return base;
}

/* ------------------------------ mutações ------------------------------ */

export function demoSalvarCupom(dados: Partial<Cupom> & { id?: string }) {
  const b = demo2();
  if (dados.id) {
    const i = b.cupons.findIndex((c) => c.id === dados.id);
    if (i >= 0) b.cupons[i] = { ...b.cupons[i], ...dados } as Cupom;
  } else {
    b.cupons.unshift({
      id: uid("cup"), codigo: "", descricao: null, tipo_desconto: "valor", valor: 0,
      inicio: null, fim: null, valor_minimo: 0, limite_total: null, limite_cliente: null,
      usos: 0, status: "ativo", created_at: new Date().toISOString(), ...dados,
    } as Cupom);
  }
}

export function demoExcluirCupom(id: string) {
  const b = demo2();
  b.cupons = b.cupons.filter((c) => c.id !== id);
}

export function demoSalvarUpsell(dados: Partial<RegraUpsell> & { id?: string }) {
  const b = demo2();
  if (dados.id) {
    const i = b.upsell.findIndex((c) => c.id === dados.id);
    if (i >= 0) b.upsell[i] = { ...b.upsell[i], ...dados } as RegraUpsell;
  } else {
    b.upsell.unshift({
      id: uid("ups"), nome: "", produto_origem: null, produto_destino: null,
      mensagem: "", tipo_desconto: "valor", desconto: 0, prioridade: b.upsell.length + 1,
      status: "ativo", exibidas: 0, aceitas: 0, faturamento: 0,
      created_at: new Date().toISOString(), ...dados,
    } as RegraUpsell);
  }
}

export function demoExcluirUpsell(id: string) {
  const b = demo2();
  b.upsell = b.upsell.filter((c) => c.id !== id);
}

export function demoStatusTroca(id: string, status: Troca["status"]) {
  const t = demo2().trocas.find((x) => x.id === id);
  if (!t) return;
  t.status = status;
  const agora = new Date().toISOString();
  if (status === "aprovada") t.approved_at = agora;
  if (status === "finalizada") { t.completed_at = agora; t.approved_at ??= agora; }
}

export function demoSalvarTroca(dados: Partial<Troca>) {
  demo2().trocas.unshift({
    id: uid("tro"), customer_id: null, order_id: null, cliente_nome: null,
    numero_pedido: null, produto_nome: null, sabor_nome: null, quantidade: 1,
    motivo: null, descricao: null, status: "solicitada",
    created_at: new Date().toISOString(), approved_at: null, completed_at: null,
    ...dados,
  } as Troca);
}

export function demoSalvarLancamento(dados: Partial<Lancamento> & { id?: string }) {
  const b = demo2();
  if (dados.id) {
    const i = b.lancamentos.findIndex((l) => l.id === dados.id);
    if (i >= 0) b.lancamentos[i] = { ...b.lancamentos[i], ...dados } as Lancamento;
  } else {
    b.lancamentos.unshift({
      id: uid("lan"), tipo: "pagar", descricao: "", categoria_id: null,
      categoria_nome: null, contraparte: null, valor: 0, vencimento: null,
      pagamento: null, bank_account_id: null, conta_nome: null,
      forma_pagamento: null, status: "pendente",
      created_at: new Date().toISOString(), ...dados,
    } as Lancamento);
  }
  recalcular();
}

export function demoBaixarLancamento(id: string, pago: boolean) {
  const l = demo2().lancamentos.find((x) => x.id === id);
  if (!l) return;
  l.status = pago ? "pago" : "pendente";
  l.pagamento = pago ? new Date().toISOString().slice(0, 10) : null;
  recalcular();
}

export function demoExcluirLancamento(id: string) {
  const b = demo2();
  b.lancamentos = b.lancamentos.filter((l) => l.id !== id);
  recalcular();
}

export function demoSalvarConta(dados: Partial<ContaBancaria> & { id?: string }) {
  const b = demo2();
  if (dados.id) {
    const i = b.contas.findIndex((c) => c.id === dados.id);
    if (i >= 0) b.contas[i] = { ...b.contas[i], ...dados } as ContaBancaria;
  } else {
    b.contas.push({
      id: uid("ban"), nome: "", banco: null, agencia: null, conta: null,
      tipo: "corrente", saldo_inicial: 0, saldo_atual: 0, status: "ativo", ...dados,
    } as ContaBancaria);
  }
  recalcular();
}

export function demoSalvarCategoria(dados: Partial<CategoriaFinanceira> & { id?: string }) {
  const b = demo2();
  if (dados.id) {
    const i = b.categorias.findIndex((c) => c.id === dados.id);
    if (i >= 0) b.categorias[i] = { ...b.categorias[i], ...dados } as CategoriaFinanceira;
  } else {
    b.categorias.push({
      id: uid("cat"), nome: "", tipo: "despesa", cor: "#9563ff",
      status: "ativo", lancamentos: 0, total: 0, ...dados,
    } as CategoriaFinanceira);
  }
}

export function demoExcluirCategoria(id: string) {
  const b = demo2();
  b.categorias = b.categorias.filter((c) => c.id !== id);
}

export function demoSalvarFornecedor(dados: Partial<Fornecedor> & { id?: string }) {
  const b = demo2();
  if (dados.id) {
    const i = b.fornecedores.findIndex((f) => f.id === dados.id);
    if (i >= 0) b.fornecedores[i] = { ...b.fornecedores[i], ...dados } as Fornecedor;
  } else {
    b.fornecedores.push({
      id: uid("for"), nome: "", documento: null, telefone: null,
      email: null, status: "ativo", ...dados,
    } as Fornecedor);
  }
}

export function demoSalvarNota(dados: Partial<NotaEntrada> & { id?: string }) {
  const b = demo2();
  if (dados.id) {
    const i = b.notas.findIndex((n) => n.id === dados.id);
    if (i >= 0) b.notas[i] = { ...b.notas[i], ...dados } as NotaEntrada;
  } else {
    b.notas.unshift({
      id: uid("not"), supplier_id: null, fornecedor_nome: null, numero_documento: null,
      data: new Date().toISOString().slice(0, 10), valor_total: 0, observacao: null,
      status: "rascunho", itens_count: 0, pecas: 0,
      created_at: new Date().toISOString(), ...dados,
    } as NotaEntrada);
  }
}

export function demoSalvarUsuario(dados: Partial<Usuario> & { id?: string }) {
  const b = demo2();
  if (dados.id) {
    const i = b.usuarios.findIndex((u) => u.id === dados.id);
    if (i >= 0) b.usuarios[i] = { ...b.usuarios[i], ...dados } as Usuario;
  } else {
    b.usuarios.push({
      id: uid("usr"), nome: "", email: null, telefone: null, cargo: null,
      role_slug: "atendimento", role_nome: "Atendimento", status: "ativo",
      ultimo_login: null, created_at: new Date().toISOString(), ...dados,
    } as Usuario);
  }
}

export function demoSalvarEvento(dados: Partial<EventoCalendario> & { id?: string }) {
  const b = demo2();
  if (dados.id) {
    const i = b.eventos.findIndex((e) => e.id === dados.id);
    if (i >= 0) b.eventos[i] = { ...b.eventos[i], ...dados } as EventoCalendario;
  } else {
    b.eventos.push({
      id: uid("eve"), titulo: "", descricao: null, tipo: "rotina",
      responsavel: null, inicio: new Date().toISOString(), fim: null,
      recorrencia: "none", cor: "#9563ff", status: "ativo", ...dados,
    } as EventoCalendario);
  }
}

export function demoExcluirEvento(id: string) {
  const b = demo2();
  b.eventos = b.eventos.filter((e) => e.id !== id);
}

export function demoSalvarTarefa(dados: Partial<Tarefa> & { id?: string }) {
  const d = demo();
  if (dados.id) {
    const i = d.tarefas.findIndex((t) => t.id === dados.id);
    if (i >= 0) d.tarefas[i] = { ...d.tarefas[i], ...dados } as Tarefa;
  } else {
    d.tarefas.unshift({
      id: uid("task"), titulo: "", descricao: null, prioridade: "media",
      status: "aberta", vencimento: null, criada_por: "usuario",
      created_at: new Date().toISOString(), ...dados,
    } as Tarefa);
  }
}

function recalcular() {
  const b = demo2();
  b.categorias.forEach((c) => {
    const l = b.lancamentos.filter((x) => x.categoria_id === c.id);
    c.lancamentos = l.length;
    c.total = l.reduce((a, x) => a + x.valor, 0);
  });
  b.contas.forEach((c) => {
    const entra = b.lancamentos
      .filter((l) => l.tipo === "receber" && l.bank_account_id === c.id && l.status === "pago")
      .reduce((a, l) => a + l.valor, 0);
    const sai = b.lancamentos
      .filter((l) => l.tipo === "pagar" && l.bank_account_id === c.id && l.status === "pago")
      .reduce((a, l) => a + l.valor, 0);
    c.saldo_atual = c.saldo_inicial + entra - sai;
  });
}

/** Exclusões na base de demonstração, para a tela responder igual sem banco. */
export function demoExcluirTarefa(id: string) {
  const d = demo();
  d.tarefas = d.tarefas.filter((t) => t.id !== id);
}

export function demoExcluirTroca(id: string) {
  const b = demo2();
  b.trocas = b.trocas.filter((t) => t.id !== id);
}

export function demoExcluirFornecedor(id: string) {
  const b = demo2();
  b.fornecedores = b.fornecedores.filter((f) => f.id !== id);
}

export function demoCancelarNota(id: string) {
  const b = demo2();
  b.notas = b.notas.filter((n) => n.id !== id);
}
