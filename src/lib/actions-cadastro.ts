"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServer } from "./supabase/server";
import { STORE_ID, supabaseConfigurado } from "./supabase/config";
import {
  demoCriarProduto, demoCriarSabor, demoExcluirCliente, demoExcluirProduto,
  demoExcluirSabor, demoSalvarCliente, demoSalvarMarca, demoExcluirMarca,
} from "./demo";

type Resultado = { ok: boolean; erro?: string };

async function cli() {
  return supabaseConfigurado ? await getSupabaseServer() : null;
}

const slug = (v: string) =>
  v.normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/* ------------------------------------------------------------------ PRODUTO */

export interface DadosProduto {
  nome: string;
  modelo?: string | null;
  brand_id?: string | null;
  puffs?: number | null;
  sku?: string | null;
  preco: number;
  custo: number;
  descricao?: string | null;
  destaque?: boolean;
}

export async function criarProduto(
  dados: DadosProduto,
): Promise<Resultado & { id?: string }> {
  if (!dados.nome.trim()) return { ok: false, erro: "Informe o nome do produto." };
  if (dados.preco <= 0) return { ok: false, erro: "O preço precisa ser maior que zero." };
  if (dados.custo > dados.preco) {
    return { ok: false, erro: "O custo está maior que o preço — a venda daria prejuízo." };
  }

  const c = await cli();
  if (!c) {
    const r = demoCriarProduto(dados);
    revalidatePath("/produtos"); revalidatePath("/catalogo");
    return r;
  }

  const { data, error } = await c.from("products")
    .insert({ ...dados, store_id: STORE_ID, status: "ativo" })
    .select("id").single();
  if (error) return { ok: false, erro: error.message };

  revalidatePath("/produtos"); revalidatePath("/catalogo");
  return { ok: true, id: data.id };
}

/**
 * Produto sai do catálogo mas o histórico fica: pedido antigo continua
 * mostrando o que foi vendido, pelo preço que foi cobrado.
 */
export async function excluirProduto(id: string): Promise<Resultado> {
  const c = await cli();

  if (!c) {
    const r = demoExcluirProduto(id);
    revalidatePath("/produtos"); revalidatePath("/catalogo");
    return r;
  }

  // com estoque em casa, apagar esconderia peça que existe na prateleira
  const { data: estoque } = await c.from("v_catalogo")
    .select("estoque_total").eq("product_id", id);
  const emCasa = (estoque ?? []).reduce((a, e) => a + Number(e.estoque_total ?? 0), 0);
  if (emCasa > 0) {
    return {
      ok: false,
      erro: `Ainda há ${emCasa} unidade(s) em estoque. Zere o estoque ou desative o produto.`,
    };
  }

  const { error } = await c.from("products")
    .update({ deleted_at: new Date().toISOString(), status: "inativo" })
    .eq("id", id);
  if (error) return { ok: false, erro: error.message };

  revalidatePath("/produtos"); revalidatePath("/catalogo");
  return { ok: true };
}

/* -------------------------------------------------------------------- MARCA */

export async function salvarMarca(
  dados: { id?: string; nome: string; ordem?: number },
): Promise<Resultado & { id?: string }> {
  if (!dados.nome.trim()) return { ok: false, erro: "Informe o nome da marca." };

  const c = await cli();
  if (!c) {
    const r = demoSalvarMarca(dados);
    revalidatePath("/produtos"); revalidatePath("/catalogo");
    return r;
  }

  const campos = { nome: dados.nome.trim(), slug: slug(dados.nome), ordem: dados.ordem ?? 0 };
  const { data, error } = dados.id
    ? await c.from("brands").update(campos).eq("id", dados.id).select("id").single()
    : await c.from("brands").insert({ ...campos, store_id: STORE_ID }).select("id").single();
  if (error) return { ok: false, erro: error.message };

  revalidatePath("/produtos"); revalidatePath("/catalogo");
  return { ok: true, id: data.id };
}

export async function excluirMarca(id: string): Promise<Resultado> {
  const c = await cli();
  if (!c) {
    const r = demoExcluirMarca(id);
    revalidatePath("/produtos");
    return r;
  }

  const { count } = await c.from("products")
    .select("id", { count: "exact", head: true })
    .eq("brand_id", id).is("deleted_at", null);
  if (count && count > 0) {
    return { ok: false, erro: `A marca ainda tem ${count} produto(s). Mova ou exclua antes.` };
  }

  const { error } = await c.from("brands")
    .update({ deleted_at: new Date().toISOString(), status: "inativo" }).eq("id", id);
  if (error) return { ok: false, erro: error.message };

  revalidatePath("/produtos");
  return { ok: true };
}

/* -------------------------------------------------------------------- SABOR */

/** Cria o sabor se ainda não existir e o liga ao produto. */
export async function criarSabor(
  produtoId: string, nomeSabor: string, estoqueMinimo = 3,
): Promise<Resultado & { id?: string }> {
  if (!nomeSabor.trim()) return { ok: false, erro: "Informe o nome do sabor." };

  const c = await cli();
  if (!c) {
    const r = demoCriarSabor(produtoId, nomeSabor.trim(), estoqueMinimo);
    revalidatePath("/catalogo"); revalidatePath("/sabores");
    return r;
  }

  const nome = nomeSabor.trim();
  let { data: sabor } = await c.from("flavors")
    .select("id").eq("store_id", STORE_ID).eq("slug", slug(nome)).maybeSingle();

  if (!sabor) {
    const { data, error } = await c.from("flavors")
      .insert({ store_id: STORE_ID, nome, slug: slug(nome) })
      .select("id").single();
    if (error) return { ok: false, erro: error.message };
    sabor = data;
  }

  const { data: vinculo, error } = await c.from("product_flavors")
    .insert({
      store_id: STORE_ID, product_id: produtoId, flavor_id: sabor.id,
      estoque_minimo: estoqueMinimo, ativo: true,
    })
    .select("id").single();

  if (error) {
    if (error.code === "23505") return { ok: false, erro: "Este produto já tem esse sabor." };
    return { ok: false, erro: error.message };
  }

  revalidatePath("/catalogo"); revalidatePath("/sabores");
  return { ok: true, id: vinculo.id };
}

export async function excluirSabor(productFlavorId: string): Promise<Resultado> {
  const c = await cli();
  if (!c) {
    const r = demoExcluirSabor(productFlavorId);
    revalidatePath("/catalogo"); revalidatePath("/sabores");
    return r;
  }

  const { data: inv } = await c.from("inventory")
    .select("quantidade_total").eq("product_flavor_id", productFlavorId).maybeSingle();
  if (Number(inv?.quantidade_total ?? 0) > 0) {
    return {
      ok: false,
      erro: `Ainda há ${inv?.quantidade_total} unidade(s) deste sabor. Zere o estoque ou desative.`,
    };
  }

  const { error } = await c.from("product_flavors").delete().eq("id", productFlavorId);
  if (error) return { ok: false, erro: error.message };

  revalidatePath("/catalogo"); revalidatePath("/sabores");
  return { ok: true };
}

/* ------------------------------------------------------------------ CLIENTE */

export interface DadosCliente {
  id?: string;
  nome: string;
  telefone?: string | null;
  email?: string | null;
  instagram_username?: string | null;
  maioridade_validada?: boolean;
  tags?: string[];
  observacoes?: string | null;
}

export async function salvarCliente(
  dados: DadosCliente,
): Promise<Resultado & { id?: string }> {
  if (!dados.nome.trim()) return { ok: false, erro: "Informe o nome do cliente." };

  const c = await cli();
  if (!c) {
    const r = demoSalvarCliente(dados);
    revalidatePath("/clientes");
    return r;
  }

  const campos = {
    nome: dados.nome.trim(),
    telefone: dados.telefone || null,
    email: dados.email || null,
    instagram_username: dados.instagram_username || null,
    maioridade_validada: dados.maioridade_validada ?? false,
    tags: dados.tags ?? [],
    observacoes: dados.observacoes || null,
  };

  const { data, error } = dados.id
    ? await c.from("customers").update(campos).eq("id", dados.id).select("id").single()
    : await c.from("customers")
        .insert({ ...campos, store_id: STORE_ID, origem: "Cadastro manual" })
        .select("id").single();

  if (error) {
    // telefone é único por loja: dois cadastros do mesmo número viram dois
    // históricos separados, e o atendente nunca vê a compra anterior
    if (error.code === "23505") {
      return { ok: false, erro: "Já existe um cliente com este telefone." };
    }
    return { ok: false, erro: error.message };
  }

  revalidatePath("/clientes");
  return { ok: true, id: data.id };
}

export async function excluirCliente(id: string): Promise<Resultado> {
  const c = await cli();
  if (!c) {
    const r = demoExcluirCliente(id);
    revalidatePath("/clientes");
    return r;
  }

  const { count } = await c.from("orders")
    .select("id", { count: "exact", head: true }).eq("customer_id", id);
  if (count && count > 0) {
    return {
      ok: false,
      erro: `Este cliente tem ${count} pedido(s). O histórico de venda não pode ser apagado.`,
    };
  }

  const { error } = await c.from("customers")
    .update({ deleted_at: new Date().toISOString(), status: "inativo" }).eq("id", id);
  if (error) return { ok: false, erro: error.message };

  revalidatePath("/clientes");
  return { ok: true };
}
