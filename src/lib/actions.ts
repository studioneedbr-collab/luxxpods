"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServer } from "./supabase/server";
import { STORE_ID, supabaseConfigurado } from "./supabase/config";
import {
  demoAjustarEstoque, demoAlternarBot, demoAlternarProduto, demoAlternarSabor,
  demoAlterarStatusPedido, demoEnviarMensagem, demoMarcarLido, demoMoverLead,
  demoSalvarProduto,
} from "./demo";
import type { PedidoStatus } from "./types";

async function cli() {
  return supabaseConfigurado ? await getSupabaseServer() : null;
}

/** Toda ação devolve o mesmo formato, para a tela saber o que mostrar. */
type Resultado = { ok: boolean; erro?: string };

/* ------------------------------------------------------------------ CHATS */

export async function enviarMensagem(conversationId: string, conteudo: string): Promise<Resultado> {
  const texto = conteudo.trim();
  if (!texto) return { ok: false, erro: "Mensagem vazia" };

  const c = await cli();
  if (!c) {
    demoEnviarMensagem(conversationId, texto, "atendente");
  } else {
    const { data: user } = await c.auth.getUser();
    const { error } = await c.from("messages").insert({
      conversation_id: conversationId,
      store_id: STORE_ID,
      sender_type: "atendente",
      sender_id: user?.user?.id ?? null,
      tipo: "texto",
      conteudo: texto,
      status: "pendente",
    });
    if (error) return { ok: false, erro: error.message };

    await c.from("conversations").update({
      ultima_mensagem: texto,
      ultima_mensagem_em: new Date().toISOString(),
      ultima_interacao_sistema: new Date().toISOString(),
      nao_lidas: 0,
    }).eq("id", conversationId);

    // a fila entrega no canal (WhatsApp/Instagram)
    await c.from("jobs").insert({
      store_id: STORE_ID,
      tipo: "enviar_mensagem",
      conversation_id: conversationId,
      payload: { conteudo: texto },
    });
  }

  revalidatePath("/chats");
  return { ok: true };
}

export async function assumirConversa(conversationId: string): Promise<Resultado> {
  const c = await cli();
  if (!c) {
    demoAlternarBot(conversationId, false);
  } else {
    const { data: user } = await c.auth.getUser();
    await c.from("conversations").update({
      bot_ativo: false,
      responsavel_id: user?.user?.id ?? null,
      estado: "HUMAN",
    }).eq("id", conversationId);
    await c.from("messages").insert({
      conversation_id: conversationId, store_id: STORE_ID,
      sender_type: "sistema", tipo: "sistema",
      conteudo: "Atendente assumiu a conversa. Bot pausado.",
    });
  }
  revalidatePath("/chats");
  return { ok: true };
}

export async function devolverParaBot(conversationId: string): Promise<Resultado> {
  const c = await cli();
  if (!c) {
    demoAlternarBot(conversationId, true);
  } else {
    await c.from("conversations").update({
      bot_ativo: true, responsavel_id: null,
    }).eq("id", conversationId);
    await c.from("messages").insert({
      conversation_id: conversationId, store_id: STORE_ID,
      sender_type: "sistema", tipo: "sistema",
      conteudo: "Atendimento devolvido para o bot.",
    });
  }
  revalidatePath("/chats");
  return { ok: true };
}

export async function marcarComoLida(conversationId: string): Promise<Resultado> {
  const c = await cli();
  if (!c) demoMarcarLido(conversationId);
  else await c.from("conversations").update({ nao_lidas: 0 }).eq("id", conversationId);
  revalidatePath("/chats");
  return { ok: true };
}

/* ----------------------------------------------------------------- KANBAN */

export async function moverLead(leadId: string, stageId: string): Promise<Resultado> {
  const c = await cli();
  if (!c) {
    demoMoverLead(leadId, stageId);
  } else {
    const { data: etapa } = await c
      .from("pipeline_stages").select("tipo").eq("id", stageId).maybeSingle();
    const status = etapa?.tipo === "ganho" ? "ganho" : etapa?.tipo === "perdido" ? "perdido" : "aberto";
    await c.from("leads").update({
      stage_id: stageId,
      status,
      data_ganho: status === "ganho" ? new Date().toISOString() : null,
      data_perda: status === "perdido" ? new Date().toISOString() : null,
    }).eq("id", leadId);
  }
  revalidatePath("/kanban");
  return { ok: true };
}

/* ---------------------------------------------------------------- PEDIDOS */

export async function alterarStatusPedido(pedidoId: string, status: PedidoStatus): Promise<Resultado> {
  const c = await cli();
  if (!c) {
    demoAlterarStatusPedido(pedidoId, status);
  } else if (status === "confirmado") {
    const { error } = await c.rpc("confirmar_pedido", { p_order_id: pedidoId });
    if (error) return { ok: false, erro: error.message };
  } else {
    const campos: Record<string, string> = {};
    const agora = new Date().toISOString();
    if (status === "em_separacao") campos.separado_em = agora;
    if (status === "saiu_para_entrega") campos.despachado_em = agora;
    if (status === "entregue") campos.entregue_em = agora;
    const { error } = await c.from("orders")
      .update({ status_pedido: status, ...campos }).eq("id", pedidoId);
    if (error) return { ok: false, erro: error.message };
  }
  revalidatePath("/pedidos");
  revalidatePath(`/pedidos/${pedidoId}`);
  return { ok: true };
}

export async function cancelarPedido(pedidoId: string, motivo: string): Promise<Resultado> {
  const c = await cli();
  if (!c) {
    demoAlterarStatusPedido(pedidoId, "cancelado");
  } else {
    const { error } = await c.rpc("cancelar_pedido", {
      p_order_id: pedidoId, p_motivo: motivo,
    });
    if (error) return { ok: false, erro: error.message };
  }
  revalidatePath("/pedidos");
  revalidatePath(`/pedidos/${pedidoId}`);
  return { ok: true };
}

/* ---------------------------------------------------------- CATÁLOGO/ESTOQUE */

export async function ajustarEstoque(pfId: string, novoTotal: number, observacao?: string): Promise<Resultado> {
  const c = await cli();
  if (!c) {
    demoAjustarEstoque(pfId, novoTotal, observacao);
  } else {
    const { data: inv } = await c.from("inventory")
      .select("quantidade_total").eq("product_flavor_id", pfId).maybeSingle();
    const atual = Number(inv?.quantidade_total ?? 0);
    const delta = novoTotal - atual;
    if (delta !== 0) {
      const { error } = await c.rpc("mover_estoque", {
        p_product_flavor_id: pfId,
        p_tipo: delta > 0 ? "ajuste_positivo" : "ajuste_negativo",
        p_quantidade: Math.abs(delta),
        p_referencia_tipo: "ajuste_manual",
        p_observacao: observacao ?? "Ajuste manual pelo painel",
      });
      if (error) return { ok: false, erro: error.message };
    }
  }
  revalidatePath("/estoque");
  revalidatePath("/catalogo");
  return { ok: true };
}

export async function alternarProduto(produtoId: string, ativo: boolean): Promise<Resultado> {
  const c = await cli();
  if (!c) demoAlternarProduto(produtoId, ativo);
  else await c.from("products").update({ status: ativo ? "ativo" : "inativo" }).eq("id", produtoId);
  revalidatePath("/produtos");
  revalidatePath("/catalogo");
  return { ok: true };
}

export async function alternarSabor(pfId: string, ativo: boolean): Promise<Resultado> {
  const c = await cli();
  if (!c) demoAlternarSabor(pfId, ativo);
  else await c.from("product_flavors").update({ ativo }).eq("id", pfId);
  revalidatePath("/catalogo");
  return { ok: true };
}

export async function salvarProduto(
  produtoId: string,
  dados: { nome?: string; preco?: number; custo?: number; descricao?: string; destaque?: boolean },
): Promise<Resultado> {
  const c = await cli();
  if (!c) demoSalvarProduto(produtoId, dados);
  else {
    const { error } = await c.from("products").update(dados).eq("id", produtoId);
    if (error) return { ok: false, erro: error.message };
  }
  revalidatePath("/produtos");
  revalidatePath("/catalogo");
  return { ok: true };
}
