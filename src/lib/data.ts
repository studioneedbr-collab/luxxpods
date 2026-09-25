/**
 * Camada única de leitura do sistema.
 * Consulta o Supabase quando configurado; caso contrário usa a base de
 * demonstração — o mesmo shape, para o painel nunca ficar quebrado.
 */
import "server-only";
import { getSupabaseServer } from "./supabase/server";
import { STORE_ID, supabaseConfigurado } from "./supabase/config";
import {
  demo, demoFunil, demoMetricas, demoResumoEstoque, demoSerie, ETAPAS_FUNIL,
} from "./demo";
import type {
  Cliente, Conversa, EtapaFunil, ItemCatalogo, Lead, Mensagem, Metricas,
  Movimento, Pedido, PedidoItem, Produto, ResumoEstoque, SeriePonto, Tarefa,
} from "./types";

export const usandoDemo = !supabaseConfigurado;

async function sb() {
  return supabaseConfigurado ? await getSupabaseServer() : null;
}

/**
 * O que fazer quando a consulta falha COM o banco conectado.
 *
 * Cair na base de demonstração aqui seria o pior modo de falha possível num
 * sistema de dinheiro: a tela mostraria 16 pedidos fictícios como se fossem
 * reais, e ninguém desconfiaria. Então o erro sobe — a tela de erro já
 * existe e diz que não carregou, que é a verdade.
 */
function aoFalhar(consulta: string, erro: { message: string } | null): never {
  const detalhe = erro?.message ?? "sem detalhe";
  console.error(`[luxx] consulta "${consulta}" falhou: ${detalhe}`);
  throw new Error(
    `Não consegui carregar ${consulta}. O banco respondeu: ${detalhe}`,
  );
}

// ---------------------------------------------------------------- DASHBOARD
export async function getMetricas(inicio: Date, fim: Date): Promise<Metricas> {
  const c = await sb();
  if (!c) return demoMetricas(inicio, fim);
  const { data, error } = await c.rpc("dashboard_metricas", {
    p_store_id: STORE_ID, p_inicio: inicio.toISOString(), p_fim: fim.toISOString(),
  });
  if (error || !data) aoFalhar("as métricas do período", error);
  return data as Metricas;
}

export async function getSerie(inicio: Date, fim: Date): Promise<SeriePonto[]> {
  const c = await sb();
  if (!c) return demoSerie(inicio, fim);
  const { data, error } = await c.rpc("dashboard_serie", {
    p_store_id: STORE_ID, p_inicio: inicio.toISOString(), p_fim: fim.toISOString(),
  });
  if (error || !data) aoFalhar("a série do período", error);
  return (data as SeriePonto[]).map((p) => ({
    dia: String(p.dia),
    faturamento: Number(p.faturamento),
    pedidos: Number(p.pedidos),
    leads: Number(p.leads),
  }));
}

export async function getFunil(): Promise<EtapaFunil[]> {
  const c = await sb();
  if (!c) return demoFunil();
  const { data, error } = await c
    .from("v_funil").select("*").eq("store_id", STORE_ID).order("ordem");
  if (error || !data) aoFalhar("o funil de leads", error);
  return data.map((e: Record<string, unknown>) => ({
    stage_id: String(e.stage_id), nome: String(e.nome), slug: String(e.slug),
    ordem: Number(e.ordem), cor: String(e.cor), tipo: String(e.tipo),
    leads: Number(e.leads), valor: Number(e.valor),
  }));
}

// ----------------------------------------------------------------- CATÁLOGO
export async function getCatalogo(): Promise<ItemCatalogo[]> {
  const c = await sb();
  if (!c) return demo().catalogo;
  const { data, error } = await c
    .from("v_catalogo").select("*").eq("store_id", STORE_ID)
    .order("marca").order("produto").order("sabor");
  if (error || !data) aoFalhar("o catálogo", error);
  return data as unknown as ItemCatalogo[];
}

export async function getProdutos(): Promise<Produto[]> {
  const c = await sb();
  if (!c) return demo().produtos;
  const { data, error } = await c
    .from("products")
    .select("id,nome,modelo,puffs,sku,preco,custo,status,destaque,imagem_url,descricao,brand_id,brands(nome)")
    .eq("store_id", STORE_ID).is("deleted_at", null).order("ordem");
  if (error || !data) aoFalhar("os produtos", error);

  const catalogo = await getCatalogo();
  return data.map((p: Record<string, unknown>) => {
    const sab = catalogo.filter((x) => x.product_id === p.id);
    const preco = Number(p.preco); const custo = Number(p.custo);
    const marca = (p.brands as { nome?: string } | null)?.nome ?? null;
    return {
      id: String(p.id), nome: String(p.nome),
      modelo: (p.modelo as string) ?? null, marca,
      brand_id: (p.brand_id as string) ?? null,
      puffs: (p.puffs as number) ?? null, sku: (p.sku as string) ?? null,
      preco, custo, status: p.status as "ativo" | "inativo",
      destaque: Boolean(p.destaque), imagem_url: (p.imagem_url as string) ?? null,
      descricao: (p.descricao as string) ?? null,
      sabores: sab.length,
      sabores_disponiveis: sab.filter((s) => s.estoque_disponivel > 0).length,
      estoque: sab.reduce((a, s) => a + s.estoque_total, 0),
      margem: preco > 0 ? ((preco - custo) / preco) * 100 : 0,
    };
  });
}

export async function getResumoEstoque(): Promise<ResumoEstoque> {
  const c = await sb();
  if (!c) return demoResumoEstoque();
  const { data, error } = await c
    .from("v_estoque_resumo").select("*").eq("store_id", STORE_ID).maybeSingle();
  if (error || !data) aoFalhar("o resumo do estoque", error);
  return {
    skus: Number(data.skus), pecas: Number(data.pecas),
    custo_estoque: Number(data.custo_estoque),
    valor_venda_potencial: Number(data.valor_venda_potencial),
    sem_estoque: Number(data.sem_estoque), estoque_baixo: Number(data.estoque_baixo),
  };
}

export async function getMovimentos(limite = 60): Promise<Movimento[]> {
  const c = await sb();
  if (!c) return demo().movimentos.slice(0, limite);
  const { data, error } = await c
    .from("inventory_movements")
    .select("id,tipo,quantidade,saldo_anterior,saldo_posterior,referencia_tipo,observacao,created_at,product_flavors(products(nome),flavors(nome))")
    .eq("store_id", STORE_ID).order("created_at", { ascending: false }).limit(limite);
  if (error || !data) aoFalhar("as movimentações de estoque", error);
  return data.map((m: Record<string, unknown>) => {
    const pf = m.product_flavors as { products?: { nome?: string }; flavors?: { nome?: string } } | null;
    return {
      id: Number(m.id), tipo: m.tipo as Movimento["tipo"],
      quantidade: Number(m.quantidade), saldo_anterior: Number(m.saldo_anterior),
      saldo_posterior: Number(m.saldo_posterior),
      referencia_tipo: (m.referencia_tipo as string) ?? null,
      observacao: (m.observacao as string) ?? null,
      created_at: String(m.created_at),
      produto: pf?.products?.nome, sabor: pf?.flavors?.nome,
    };
  });
}

// ----------------------------------------------------------------- CONVERSAS
export async function getConversas(): Promise<Conversa[]> {
  const c = await sb();
  if (!c) return demo().conversas;
  const { data, error } = await c
    .from("conversations")
    .select("id,customer_id,canal,estado,status,bot_ativo,nao_lidas,ultima_mensagem,ultima_mensagem_em,responsavel_id,created_at,lead_id,customers(*)")
    .eq("store_id", STORE_ID)
    .order("ultima_mensagem_em", { ascending: false, nullsFirst: false })
    .limit(150);
  if (error || !data) aoFalhar("as conversas", error);
  return data.map((r: Record<string, unknown>) => ({
    ...(r as unknown as Conversa),
    cliente: (r.customers as Cliente) ?? null,
  }));
}

export async function getMensagens(conversationId: string): Promise<Mensagem[]> {
  const c = await sb();
  if (!c) return demo().mensagens.filter((m) => m.conversation_id === conversationId);
  const { data, error } = await c
    .from("messages")
    .select("id,conversation_id,sender_type,tipo,conteudo,arquivo_url,status,created_at")
    .eq("conversation_id", conversationId).order("created_at").limit(400);
  if (error) aoFalhar("as mensagens da conversa", error);
  return (data ?? []) as unknown as Mensagem[];
}

// --------------------------------------------------------------------- LEADS
export async function getLeads(): Promise<Lead[]> {
  const c = await sb();
  if (!c) return demo().leads;
  const { data, error } = await c
    .from("leads")
    .select("id,customer_id,conversation_id,stage_id,origem,canal,valor_estimado,status,ordem,created_at,customers(*)")
    .eq("store_id", STORE_ID).order("ordem").limit(300);
  if (error || !data) aoFalhar("os leads", error);
  return data.map((r: Record<string, unknown>) => ({
    ...(r as unknown as Lead),
    cliente: (r.customers as Cliente) ?? null,
  }));
}

// ------------------------------------------------------------------- PEDIDOS
export async function getPedidos(limite = 100): Promise<Pedido[]> {
  const c = await sb();
  if (!c) {
    return [...demo().pedidos].sort(
      (a, b) => +new Date(b.created_at) - +new Date(a.created_at)).slice(0, limite);
  }
  const { data, error } = await c
    .from("orders").select("*").eq("store_id", STORE_ID)
    .order("created_at", { ascending: false }).limit(limite);
  if (error || !data) aoFalhar("os pedidos", error);
  return data as unknown as Pedido[];
}

export async function getPedido(id: string): Promise<Pedido | null> {
  const c = await sb();
  if (!c) {
    const p = demo().pedidos.find((x) => x.id === id || x.numero_pedido === id);
    return p ? { ...p, itens: demo().itens[p.id] ?? [] } : null;
  }
  // uuid e número público são colunas de tipos diferentes: escolher a coluna
  // pelo formato evita injeção no filtro e o erro de conversão de tipo
  const ehUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

  const { data } = await c
    .from("orders").select("*, order_items(*)")
    .eq("store_id", STORE_ID)
    .eq(ehUuid ? "id" : "numero_pedido", id)
    .maybeSingle();
  if (!data) return null;
  const { order_items, ...pedido } = data as Record<string, unknown>;
  return { ...(pedido as unknown as Pedido), itens: (order_items as PedidoItem[]) ?? [] };
}

// ------------------------------------------------------------------ CLIENTES
export async function getClientes(limite = 200): Promise<Cliente[]> {
  const c = await sb();
  if (!c) {
    return [...demo().clientes].sort(
      (a, b) => +new Date(b.ultima_interacao ?? 0) - +new Date(a.ultima_interacao ?? 0));
  }
  const { data, error } = await c
    .from("customers").select("*").eq("store_id", STORE_ID).is("deleted_at", null)
    .order("ultima_interacao", { ascending: false, nullsFirst: false }).limit(limite);
  if (error || !data) aoFalhar("os clientes", error);
  return data as unknown as Cliente[];
}

// ------------------------------------------------------------------- TAREFAS
export async function getTarefas(): Promise<Tarefa[]> {
  const c = await sb();
  if (!c) return demo().tarefas;
  const { data, error } = await c
    .from("tasks").select("*").eq("store_id", STORE_ID)
    .order("created_at", { ascending: false }).limit(100);
  if (error || !data) aoFalhar("as tarefas", error);
  return data as unknown as Tarefa[];
}

export { ETAPAS_FUNIL };

/**
 * Contadores da barra lateral.
 * Roda em toda navegação, então usa `count` no banco em vez de trazer as linhas.
 */
export async function getContadores(): Promise<{
  conversas: number; pedidos: number; tarefas: number;
}> {
  const c = await sb();

  if (!c) {
    const d = demo();
    return {
      conversas: d.conversas.filter((x) => x.nao_lidas > 0).length,
      pedidos: d.pedidos.filter((p) =>
        ["pendente", "aguardando_pagamento", "confirmado", "em_separacao"].includes(p.status_pedido),
      ).length,
      tarefas: d.tarefas.filter((t) => t.status === "aberta").length,
    };
  }

  const [conversas, pedidos, tarefas] = await Promise.all([
    c.from("conversations").select("id", { count: "exact", head: true })
      .eq("store_id", STORE_ID).gt("nao_lidas", 0),
    c.from("orders").select("id", { count: "exact", head: true })
      .eq("store_id", STORE_ID)
      .in("status_pedido", ["pendente", "aguardando_pagamento", "confirmado", "em_separacao"]),
    c.from("tasks").select("id", { count: "exact", head: true })
      .eq("store_id", STORE_ID).eq("status", "aberta"),
  ]);

  return {
    conversas: conversas.count ?? 0,
    pedidos: pedidos.count ?? 0,
    tarefas: tarefas.count ?? 0,
  };
}

/** Ficha completa do cliente: cadastro, endereços, pedidos e conversas. */
export async function getCliente(id: string): Promise<{
  cliente: Cliente;
  enderecos: Array<Record<string, string | null>>;
  pedidos: Pedido[];
  conversas: Conversa[];
} | null> {
  const c = await sb();

  if (!c) {
    const d = demo();
    const cliente = d.clientes.find((x) => x.id === id);
    if (!cliente) return null;
    const pedidos = d.pedidos
      .filter((p) => p.customer_id === id)
      .map((p) => ({ ...p, itens: d.itens[p.id] ?? [] }))
      .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    return {
      cliente,
      enderecos: [{
        bairro: "Centro", rua: "Rua das Flores", numero: "100",
        cidade: "Teófilo Otoni", estado: "MG", referencia: "Próximo ao mercado",
      }],
      pedidos,
      conversas: d.conversas.filter((x) => x.customer_id === id),
    };
  }

  const { data: cliente } = await c
    .from("customers").select("*").eq("id", id).maybeSingle();
  if (!cliente) return null;

  const [enderecos, pedidos, conversas] = await Promise.all([
    c.from("customer_addresses").select("*").eq("customer_id", id),
    c.from("orders").select("*, order_items(*)").eq("customer_id", id)
      .order("created_at", { ascending: false }).limit(100),
    c.from("conversations").select("*").eq("customer_id", id)
      .order("ultima_mensagem_em", { ascending: false, nullsFirst: false }),
  ]);

  return {
    cliente: cliente as unknown as Cliente,
    enderecos: (enderecos.data ?? []) as Array<Record<string, string | null>>,
    pedidos: (pedidos.data ?? []).map((p: Record<string, unknown>) => {
      const { order_items, ...pedido } = p;
      return { ...(pedido as unknown as Pedido), itens: (order_items as PedidoItem[]) ?? [] };
    }),
    conversas: (conversas.data ?? []) as unknown as Conversa[],
  };
}

/** Movimentações de um produto+sabor específico. */
export async function getMovimentosDoSabor(
  productFlavorId: string, limite = 50,
): Promise<Movimento[]> {
  const c = await sb();

  if (!c) {
    const item = demo().catalogo.find((x) => x.product_flavor_id === productFlavorId);
    if (!item) return [];
    return demo().movimentos
      .filter((m) => m.produto === item.produto && m.sabor === item.sabor)
      .slice(0, limite);
  }

  const { data, error } = await c
    .from("inventory_movements")
    .select("id,tipo,quantidade,saldo_anterior,saldo_posterior,referencia_tipo,observacao,created_at")
    .eq("product_flavor_id", productFlavorId)
    .order("created_at", { ascending: false })
    .limit(limite);
  if (error) aoFalhar("o histórico deste sabor", error);

  return (data ?? []) as unknown as Movimento[];
}
