"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServer } from "./supabase/server";
import { STORE_ID, supabaseConfigurado } from "./supabase/config";
import { demo2 } from "./demo-mvp2";
import {
  demoBaixarLancamento, demoExcluirCategoria, demoExcluirCupom, demoExcluirEvento,
  demoExcluirLancamento, demoExcluirUpsell, demoSalvarCategoria, demoSalvarConta,
  demoSalvarCupom, demoSalvarEvento, demoSalvarFornecedor, demoSalvarLancamento,
  demoSalvarNota, demoSalvarTarefa, demoSalvarUpsell, demoSalvarUsuario,
  demoStatusTroca, demoSalvarTroca,
} from "./demo-mvp2";
import type {
  CategoriaFinanceira, ContaBancaria, Cupom, EventoCalendario, Fornecedor,
  Lancamento, NotaSituacao, RegraUpsell, Tarefa, Troca, Usuario,
} from "./types";

async function cli() {
  return supabaseConfigurado ? await getSupabaseServer() : null;
}

type Resultado = { ok: boolean; erro?: string };

/** Remove campos calculados que não existem como coluna na tabela. */
function omitir(obj: object, chaves: string[]): Record<string, unknown> {
  const saida: Record<string, unknown> = { ...obj } as Record<string, unknown>;
  chaves.forEach((k) => delete saida[k]);
  return saida;
}

/* ------------------------------------------------------------------ CUPONS */

export async function salvarCupom(dados: Partial<Cupom> & { id?: string }): Promise<Resultado> {
  const c = await cli();
  if (!c) { demoSalvarCupom(dados); }
  else {
    const { id, ...resto } = dados;
    const campos = omitir(resto, ["usos", "created_at"]);
    const payload = { ...campos, store_id: STORE_ID };
    const { error } = id
      ? await c.from("coupons").update(campos).eq("id", id)
      : await c.from("coupons").insert(payload);
    if (error) return { ok: false, erro: error.message };
  }
  revalidatePath("/cupons");
  return { ok: true };
}

export async function excluirCupom(id: string): Promise<Resultado> {
  const c = await cli();
  if (!c) demoExcluirCupom(id);
  else {
    const { error } = await c.from("coupons").delete().eq("id", id);
    if (error) return { ok: false, erro: error.message };
  }
  revalidatePath("/cupons");
  return { ok: true };
}

/* ------------------------------------------------------------------ UPSELL */

export async function salvarUpsell(dados: Partial<RegraUpsell> & { id?: string }): Promise<Resultado> {
  const c = await cli();
  if (!c) { demoSalvarUpsell(dados); }
  else {
    const { id, ...resto } = dados;
    const campos = omitir(resto, [
      "exibidas", "aceitas", "faturamento",
      "produto_origem_nome", "produto_destino_nome", "created_at",
    ]);
    const { error } = id
      ? await c.from("upsell_rules").update(campos).eq("id", id)
      : await c.from("upsell_rules").insert({ ...campos, store_id: STORE_ID });
    if (error) return { ok: false, erro: error.message };
  }
  revalidatePath("/upsell");
  return { ok: true };
}

export async function excluirUpsell(id: string): Promise<Resultado> {
  const c = await cli();
  if (!c) demoExcluirUpsell(id);
  else {
    const { error } = await c.from("upsell_rules").delete().eq("id", id);
    if (error) return { ok: false, erro: error.message };
  }
  revalidatePath("/upsell");
  return { ok: true };
}

/* ------------------------------------------------------------------ TROCAS */

/**
 * Abre uma solicitação de troca a partir de um pedido.
 * Nasce como "solicitada": nada de estoque acontece até ser finalizada.
 */
export async function criarTroca(dados: {
  order_id: string;
  order_item_id?: string | null;
  product_flavor_id?: string | null;
  quantidade: number;
  motivo: string;
  descricao?: string | null;
}): Promise<Resultado & { id?: string }> {
  if (!dados.motivo.trim()) return { ok: false, erro: "Informe o motivo da troca." };
  if (dados.quantidade < 1) return { ok: false, erro: "Quantidade inválida." };

  const c = await cli();

  if (!c) {
    const pedido = (await import("./demo")).demo().pedidos.find((p) => p.id === dados.order_id);
    if (!pedido) return { ok: false, erro: "Pedido não encontrado." };
    const item = (await import("./demo")).demo().itens[dados.order_id]?.[0];

    demoSalvarTroca({
      customer_id: pedido.customer_id,
      order_id: pedido.id,
      cliente_nome: pedido.cliente_nome,
      numero_pedido: pedido.numero_pedido,
      produto_nome: item?.produto_nome ?? null,
      sabor_nome: item?.sabor_nome ?? null,
      quantidade: dados.quantidade,
      motivo: dados.motivo,
      descricao: dados.descricao ?? null,
    });
    revalidatePath("/trocas");
    return { ok: true };
  }

  const { data: pedido } = await c.from("orders")
    .select("customer_id").eq("id", dados.order_id).maybeSingle();
  if (!pedido) return { ok: false, erro: "Pedido não encontrado." };

  const { data, error } = await c.from("exchanges")
    .insert({
      store_id: STORE_ID,
      customer_id: pedido.customer_id,
      order_id: dados.order_id,
      order_item_id: dados.order_item_id ?? null,
      product_flavor_id: dados.product_flavor_id ?? null,
      quantidade: dados.quantidade,
      motivo: dados.motivo,
      descricao: dados.descricao ?? null,
      status: "solicitada",
    })
    .select("id").single();
  if (error) return { ok: false, erro: error.message };

  revalidatePath("/trocas");
  return { ok: true, id: data.id };
}

export async function alterarStatusTroca(id: string, status: Troca["status"]): Promise<Resultado> {
  const c = await cli();
  if (!c) { demoStatusTroca(id, status); }
  else {
    const agora = new Date().toISOString();
    const campos: Record<string, unknown> = { status };
    if (status === "aprovada") campos.approved_at = agora;
    if (status === "finalizada") campos.completed_at = agora;

    const { error } = await c.from("exchanges").update(campos).eq("id", id);
    if (error) return { ok: false, erro: error.message };

    // ao finalizar, devolve a peça ao estoque
    if (status === "finalizada") {
      const { data: troca } = await c.from("exchanges")
        .select("product_flavor_id, quantidade").eq("id", id).maybeSingle();
      if (troca?.product_flavor_id) {
        await c.rpc("mover_estoque", {
          p_product_flavor_id: troca.product_flavor_id,
          p_tipo: "devolucao",
          p_quantidade: troca.quantidade ?? 1,
          p_referencia_tipo: "exchange",
          p_referencia_id: id,
          p_observacao: "Devolução por troca finalizada",
        });
      }
    }
  }
  revalidatePath("/trocas");
  revalidatePath("/estoque");
  return { ok: true };
}

/* ------------------------------------------------------------ FORNECEDORES */

export async function salvarFornecedor(
  dados: Partial<Fornecedor> & { id?: string },
): Promise<Resultado> {
  const c = await cli();
  if (!c) { demoSalvarFornecedor(dados); }
  else {
    const { id, ...campos } = dados;
    const { error } = id
      ? await c.from("suppliers").update(campos).eq("id", id)
      : await c.from("suppliers").insert({ ...campos, store_id: STORE_ID });
    if (error) return { ok: false, erro: error.message };
  }
  revalidatePath("/notas-entrada");
  return { ok: true };
}

/* ----------------------------------------------------------- NOTA DE ENTRADA */

/* ------------------------------------------------------- NOTA DE ENTRADA ---
 * Lançar a nota e dar entrada no estoque são atos separados.
 * A nota nasce "em trânsito" e nada toca estoque, custo ou financeiro até
 * alguém CONCLUIR — depois de conferir a carga que chegou.
 * -------------------------------------------------------------------------- */

export async function criarNota(
  dados: {
    supplier_id: string | null;
    numero_documento: string | null;
    data: string;
    observacao: string | null;
    cotacao: number | null;
    freteiro_pct: number;
    vencimento: string | null;
  },
  itens: Array<{ product_flavor_id: string; quantidade: number; custo_unitario: number }>,
): Promise<Resultado & { id?: string }> {
  if (itens.length === 0) return { ok: false, erro: "Informe ao menos um item" };

  const total = itens.reduce((a, i) => a + i.quantidade * i.custo_unitario, 0);
  const pecas = itens.reduce((a, i) => a + i.quantidade, 0);
  const c = await cli();

  if (!c) {
    const fornecedor = demo2().fornecedores.find((f) => f.id === dados.supplier_id);
    demoSalvarNota({
      ...dados,
      fornecedor_nome: fornecedor?.nome ?? null,
      valor_total: total,
      situacao: "transito",
      estoque_aplicado: false,
      itens_count: itens.length,
      pecas,
    });
    revalidatePath("/notas-entrada");
    return { ok: true };
  }

  const { data: nota, error } = await c.from("purchase_entries")
    .insert({
      ...dados,
      store_id: STORE_ID,
      valor_total: total,
      situacao: "transito",
      status: "rascunho",
      estoque_aplicado: false,
    })
    .select("id").single();
  if (error || !nota) return { ok: false, erro: error?.message ?? "Falha ao criar a nota" };

  const { error: erroItens } = await c.from("purchase_entry_items").insert(
    itens.map((i) => ({
      entry_id: nota.id,
      product_flavor_id: i.product_flavor_id,
      quantidade: i.quantidade,
      custo_unitario: i.custo_unitario,
      subtotal: i.quantidade * i.custo_unitario,
    })),
  );
  if (erroItens) return { ok: false, erro: erroItens.message };

  revalidatePath("/notas-entrada");
  return { ok: true, id: nota.id };
}

/** Move a nota entre trânsito e conferência (nenhum efeito colateral). */
export async function situacaoNota(id: string, situacao: NotaSituacao): Promise<Resultado> {
  const c = await cli();
  if (!c) {
    demoSalvarNota({ id, situacao });
  } else {
    const campos: Record<string, unknown> = { situacao };
    if (situacao === "conferencia") campos.conferencia_iniciada_em = new Date().toISOString();
    const { error } = await c.from("purchase_entries").update(campos).eq("id", id);
    if (error) return { ok: false, erro: error.message };
  }
  revalidatePath("/notas-entrada");
  return { ok: true };
}

/**
 * Concluir: o estoque sobe, o custo médio é recalculado (com o freteiro
 * embutido) e a conta a pagar é criada — tudo numa transação no banco.
 */
export async function concluirNota(id: string): Promise<Resultado> {
  const c = await cli();

  if (!c) {
    const nota = demo2().notas.find((n) => n.id === id);
    if (!nota) return { ok: false, erro: "Nota não encontrada" };
    if (nota.estoque_aplicado) return { ok: true }; // idempotente

    const { demo, demoAjustarEstoque } = await import("./demo");
    // na demonstração não há itens gravados: distribui as peças no catálogo
    const alvos = demo().catalogo.slice(0, Math.max(1, nota.itens_count));
    const porItem = Math.max(1, Math.round(nota.pecas / alvos.length));
    alvos.forEach((c2) => {
      demoAjustarEstoque(
        c2.product_flavor_id,
        c2.estoque_total + porItem,
        `Entrada pela nota ${nota.numero_documento ?? "sem número"}`,
      );
    });

    demoSalvarNota({ id, situacao: "concluida", estoque_aplicado: true });
    demoSalvarLancamento({
      tipo: "pagar",
      descricao: `Nota ${nota.numero_documento ?? "sem número"}`,
      contraparte: nota.fornecedor_nome,
      categoria_id: "cat-d1", categoria_nome: "Mercadoria",
      valor: nota.valor_total,
      vencimento: nota.vencimento,
      status: "pendente",
    });
    if (nota.freteiro_pct > 0) {
      demoSalvarLancamento({
        tipo: "pagar",
        descricao: `Freteiro da nota ${nota.numero_documento ?? "sem número"}`,
        categoria_id: "cat-d5", categoria_nome: "Motoboy",
        valor: nota.valor_total * (nota.freteiro_pct / 100),
        vencimento: nota.vencimento,
        status: "pendente",
      });
    }
  } else {
    const { error } = await c.rpc("concluir_nota_entrada", { p_nota_id: id });
    if (error) return { ok: false, erro: error.message };
  }

  revalidatePath("/notas-entrada");
  revalidatePath("/estoque");
  revalidatePath("/catalogo");
  revalidatePath("/financeiro/pagar");
  return { ok: true };
}

/** Reabrir: estorna o estoque pela mesma trilha e cancela as contas geradas. */
export async function reabrirNota(id: string, motivo?: string): Promise<Resultado> {
  const c = await cli();

  if (!c) {
    const nota = demo2().notas.find((n) => n.id === id);
    if (!nota || !nota.estoque_aplicado) {
      demoSalvarNota({ id, situacao: "conferencia" });
    } else {
      const { demo, demoAjustarEstoque } = await import("./demo");
      const alvos = demo().catalogo.slice(0, Math.max(1, nota.itens_count));
      const porItem = Math.max(1, Math.round(nota.pecas / alvos.length));
      alvos.forEach((c2) => {
        demoAjustarEstoque(
          c2.product_flavor_id,
          Math.max(0, c2.estoque_total - porItem),
          motivo ?? "Reabertura da nota de entrada",
        );
      });
      demoSalvarNota({ id, situacao: "conferencia", estoque_aplicado: false });
    }
  } else {
    const { error } = await c.rpc("reabrir_nota_entrada", {
      p_nota_id: id, p_motivo: motivo ?? null,
    });
    if (error) return { ok: false, erro: error.message };
  }

  revalidatePath("/notas-entrada");
  revalidatePath("/estoque");
  revalidatePath("/financeiro/pagar");
  return { ok: true };
}

/* -------------------------------------------------------------- FINANCEIRO */

export async function salvarLancamento(
  dados: Partial<Lancamento> & { id?: string },
): Promise<Resultado> {
  const c = await cli();
  if (!c) { demoSalvarLancamento(dados); }
  else {
    const { id, tipo, contraparte, ...resto } = dados;
    const campos = omitir(resto, ["categoria_nome", "conta_nome", "numero_pedido", "created_at"]);
    const tabela = tipo === "receber" ? "accounts_receivable" : "accounts_payable";
    const payload: Record<string, unknown> = { ...campos, store_id: STORE_ID };
    if (tipo === "pagar" && contraparte) payload.descricao ??= contraparte;

    const { error } = id
      ? await c.from(tabela).update(campos).eq("id", id)
      : await c.from(tabela).insert(payload);
    if (error) return { ok: false, erro: error.message };
  }
  revalidatePath("/financeiro");
  revalidatePath("/financeiro/pagar");
  revalidatePath("/financeiro/receber");
  return { ok: true };
}

export async function baixarLancamento(
  id: string, tipo: "receber" | "pagar", pago: boolean,
): Promise<Resultado> {
  const c = await cli();
  if (!c) { demoBaixarLancamento(id, pago); }
  else {
    const tabela = tipo === "receber" ? "accounts_receivable" : "accounts_payable";
    const { error } = await c.from(tabela).update({
      status: pago ? "pago" : "pendente",
      pagamento: pago ? new Date().toISOString().slice(0, 10) : null,
    }).eq("id", id);
    if (error) return { ok: false, erro: error.message };
  }
  revalidatePath("/financeiro");
  revalidatePath("/financeiro/pagar");
  revalidatePath("/financeiro/receber");
  return { ok: true };
}

export async function excluirLancamento(
  id: string, tipo: "receber" | "pagar",
): Promise<Resultado> {
  const c = await cli();
  if (!c) demoExcluirLancamento(id);
  else {
    const tabela = tipo === "receber" ? "accounts_receivable" : "accounts_payable";
    const { error } = await c.from(tabela).delete().eq("id", id);
    if (error) return { ok: false, erro: error.message };
  }
  revalidatePath("/financeiro/pagar");
  revalidatePath("/financeiro/receber");
  return { ok: true };
}

export async function salvarContaBancaria(
  dados: Partial<ContaBancaria> & { id?: string },
): Promise<Resultado> {
  const c = await cli();
  if (!c) { demoSalvarConta(dados); }
  else {
    const { id, ...resto } = dados;
    const campos = omitir(resto, ["saldo_atual"]);
    const { error } = id
      ? await c.from("bank_accounts").update(campos).eq("id", id)
      : await c.from("bank_accounts").insert({ ...campos, store_id: STORE_ID });
    if (error) return { ok: false, erro: error.message };
  }
  revalidatePath("/financeiro/contas");
  return { ok: true };
}

export async function excluirContaBancaria(id: string): Promise<Resultado> {
  const c = await cli();

  if (!c) {
    const b = demo2();
    const usada = b.lancamentos.some((l) => l.bank_account_id === id);
    if (usada) {
      return { ok: false, erro: "Esta conta tem lançamentos. Desative em vez de excluir." };
    }
    b.contas = b.contas.filter((x) => x.id !== id);
    revalidatePath("/financeiro/contas");
    return { ok: true };
  }

  // conta com movimento não some: o extrato perderia a contrapartida
  const [receber, pagar] = await Promise.all([
    c.from("accounts_receivable").select("id", { count: "exact", head: true })
      .eq("bank_account_id", id),
    c.from("accounts_payable").select("id", { count: "exact", head: true })
      .eq("bank_account_id", id),
  ]);
  const total = (receber.count ?? 0) + (pagar.count ?? 0);
  if (total > 0) {
    return {
      ok: false,
      erro: `Esta conta tem ${total} lançamento(s). Desative em vez de excluir.`,
    };
  }

  const { error } = await c.from("bank_accounts").delete().eq("id", id);
  if (error) return { ok: false, erro: error.message };

  revalidatePath("/financeiro/contas");
  return { ok: true };
}

export async function salvarCategoria(
  dados: Partial<CategoriaFinanceira> & { id?: string },
): Promise<Resultado> {
  const c = await cli();
  if (!c) { demoSalvarCategoria(dados); }
  else {
    const { id, ...resto } = dados;
    const campos = omitir(resto, ["lancamentos", "total"]);
    const { error } = id
      ? await c.from("financial_categories").update(campos).eq("id", id)
      : await c.from("financial_categories").insert({ ...campos, store_id: STORE_ID });
    if (error) return { ok: false, erro: error.message };
  }
  // a categoria é escolhida nos lançamentos: revalidar só a tela dela
  // deixaria o seletor desatualizado até alguém recarregar
  revalidatePath("/financeiro/categorias");
  revalidatePath("/financeiro/pagar");
  revalidatePath("/financeiro/receber");
  revalidatePath("/financeiro");
  return { ok: true };
}

export async function excluirCategoria(id: string): Promise<Resultado> {
  const c = await cli();
  if (!c) demoExcluirCategoria(id);
  else {
    const { error } = await c.from("financial_categories").delete().eq("id", id);
    if (error) return { ok: false, erro: error.message };
  }
  revalidatePath("/financeiro/categorias");
  revalidatePath("/financeiro/pagar");
  revalidatePath("/financeiro/receber");
  return { ok: true };
}

/* ---------------------------------------------------------------- USUÁRIOS */

export async function salvarUsuario(dados: Partial<Usuario> & { id?: string }): Promise<Resultado> {
  const c = await cli();
  if (!c) { demoSalvarUsuario(dados); }
  else {
    const { id, role_slug, ...resto } = dados;
    const campos = omitir(resto, ["role_nome", "created_at", "ultimo_login"]);
    const payload: Record<string, unknown> = { ...campos };
    if (role_slug) {
      const { data: role } = await c.from("roles").select("id").eq("slug", role_slug).maybeSingle();
      if (role) payload.role_id = role.id;
    }
    if (!id) return { ok: false, erro: "Novos usuários são criados pelo convite do Supabase Auth." };
    const { error } = await c.from("profiles").update(payload).eq("id", id);
    if (error) return { ok: false, erro: error.message };
  }
  revalidatePath("/usuarios");
  return { ok: true };
}

/* -------------------------------------------------------------- CALENDÁRIO */

export async function salvarEvento(
  dados: Partial<EventoCalendario> & { id?: string },
): Promise<Resultado> {
  const c = await cli();
  if (!c) { demoSalvarEvento(dados); }
  else {
    const { id, ...resto } = dados;
    const campos = omitir(resto, ["responsavel"]);
    const { error } = id
      ? await c.from("calendar_events").update(campos).eq("id", id)
      : await c.from("calendar_events").insert({ ...campos, store_id: STORE_ID });
    if (error) return { ok: false, erro: error.message };
  }
  revalidatePath("/calendario");
  return { ok: true };
}

export async function excluirEvento(id: string): Promise<Resultado> {
  const c = await cli();
  if (!c) demoExcluirEvento(id);
  else {
    const { error } = await c.from("calendar_events").delete().eq("id", id);
    if (error) return { ok: false, erro: error.message };
  }
  revalidatePath("/calendario");
  return { ok: true };
}

/* ----------------------------------------------------------------- TAREFAS */

export async function salvarTarefa(dados: Partial<Tarefa> & { id?: string }): Promise<Resultado> {
  const c = await cli();
  if (!c) { demoSalvarTarefa(dados); }
  else {
    const { id, ...resto } = dados;
    const campos = omitir(resto, ["created_at"]);
    const { error } = id
      ? await c.from("tasks").update(campos).eq("id", id)
      : await c.from("tasks").insert({ ...campos, store_id: STORE_ID, criada_por: "operador" });
    if (error) return { ok: false, erro: error.message };
  }
  revalidatePath("/tarefas");
  return { ok: true };
}

export async function concluirTarefa(id: string, concluida: boolean): Promise<Resultado> {
  return salvarTarefa({
    id,
    status: concluida ? "concluida" : "aberta",
    ...(concluida ? { concluida_em: new Date().toISOString() } as Partial<Tarefa> : {}),
  });
}
