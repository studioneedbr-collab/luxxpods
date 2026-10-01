"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServer } from "./supabase/server";
import { STORE_ID, supabaseConfigurado } from "./supabase/config";
import {
  demoAjustarEstoque, demoAlternarBot, demoAlternarProduto, demoAlternarSabor,
  demoAlterarStatusPedido, demoEnviarMensagem, demoMarcarLido, demoMoverLead,
  demoSalvarProduto, demoFecharLeadDoPedido, demoReabrirLeadDoPedido,
  demoStatusPedido, demoCriarPedido, demoConversaDoPedido, demo,
} from "./demo";
import { enfileirar } from "./fila/worker";
import { agendarFollowup } from "./bot/recepcao";
import type { PedidoStatus } from "./types";
import { traduzirErroBanco } from "./erros-banco";
import { avaliarCupom } from "./cupom-core";
import { perfilAtual } from "./perfil-atual";

/** O que o cliente recebe quando o pedido anda (ETAPA 16 e 17 do escopo). */
const AVISO_POR_STATUS: Partial<Record<PedidoStatus, string>> = {
  em_separacao: "Seu pedido já está sendo separado ✅",
  saiu_para_entrega: "Seu pedido saiu para entrega 🛵",
  entregue: "Pedido entregue! Qualquer coisa é só chamar 🖤",
};

async function avisarClienteDoStatus(pedidoId: string, status: PedidoStatus) {
  const texto = AVISO_POR_STATUS[status];
  if (!texto) return;

  const c = await cli();
  const conversationId = c
    ? (await c.from("orders").select("conversation_id").eq("id", pedidoId).maybeSingle())
        .data?.conversation_id
    : demoConversaDoPedido(pedidoId);

  if (!conversationId) return;

  await enfileirar(
    "avisar_status_pedido",
    { texto, order_id: pedidoId, natureza: "transacional" },
    { conversationId },
  );
}

async function cli() {
  return supabaseConfigurado ? await getSupabaseServer() : null;
}

/** Toda ação devolve o mesmo formato, para a tela saber o que mostrar. */
type Resultado = { ok: boolean; erro?: string };

/* ------------------------------------------------------------------ CHATS */

/**
 * O atendente escreve: grava a mensagem e enfileira a entrega.
 *
 * Quem entrega é o worker da fila, não esta função — assim o canal fora do
 * ar não trava a tela, e a nova tentativa acontece sozinha.
 */
export async function enviarMensagem(conversationId: string, conteudo: string): Promise<Resultado> {
  const texto = conteudo.trim();
  if (!texto) return { ok: false, erro: "Mensagem vazia" };

  const c = await cli();
  if (!c) {
    const msg = demoEnviarMensagem(conversationId, texto, "atendente");
    await enfileirar(
      "enviar_mensagem",
      { conteudo: texto, message_id: msg.id, natureza: "transacional" },
      { conversationId },
    );
  } else {
    const { data: user } = await c.auth.getUser();

    const { data: gravada, error } = await c.from("messages")
      .insert({
        conversation_id: conversationId,
        store_id: STORE_ID,
        sender_type: "atendente",
        sender_id: user?.user?.id ?? null,
        tipo: "texto",
        conteudo: texto,
        status: "pendente",
      })
      .select("id").single();
    if (error) return { ok: false, erro: traduzirErroBanco(error) };

    await c.from("conversations").update({
      ultima_mensagem: texto,
      ultima_mensagem_em: new Date().toISOString(),
      ultima_interacao_sistema: new Date().toISOString(),
    }).eq("id", conversationId);

    await enfileirar(
      "enviar_mensagem",
      { conteudo: texto, message_id: gravada.id, natureza: "transacional" },
      { conversationId },
    );
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

/**
 * O pedido só anda para frente, uma etapa por vez.
 *
 * Sem esta trava dá para chamar o Server Action direto e levar um pedido
 * "pendente" a "entregue": o estoque nunca baixaria e a conta a receber
 * nunca nasceria, mas o pedido constaria como entregue.
 */
const PROXIMO_PERMITIDO: Record<PedidoStatus, PedidoStatus[]> = {
  pendente:             ["aguardando_pagamento", "confirmado", "cancelado"],
  aguardando_pagamento: ["confirmado", "cancelado"],
  confirmado:           ["em_separacao", "cancelado"],
  em_separacao:         ["saiu_para_entrega", "cancelado"],
  saiu_para_entrega:    ["entregue", "cancelado"],
  entregue:             [],
  cancelado:            [],
};

/**
 * O lead é o ATENDIMENTO, não o cliente: quando a venda fecha, ele sai do
 * funil. Se o cliente chamar de novo, o webhook abre um atendimento novo.
 */
export async function alterarStatusPedido(pedidoId: string, status: PedidoStatus): Promise<Resultado> {
  const c = await cli();

  if (!c) {
    const atual = demoStatusPedido(pedidoId);
    if (atual && !PROXIMO_PERMITIDO[atual].includes(status)) {
      return { ok: false, erro: `Um pedido ${atual} não pode ir direto para ${status}.` };
    }
    demoAlterarStatusPedido(pedidoId, status);
    if (status === "entregue") demoFecharLeadDoPedido(pedidoId);
    if (status === "cancelado") demoReabrirLeadDoPedido(pedidoId);
    await avisarClienteDoStatus(pedidoId, status);
    revalidatePath("/pedidos");
    revalidatePath("/kanban");
    revalidatePath(`/pedidos/${pedidoId}`);
    return { ok: true };
  }

  // o id do PERFIL, não o do Auth: quem entrou sem perfil grava null em vez
  // de estourar a chave estrangeira com uma mensagem que não ajuda ninguém
  const { id: usuarioId } = await perfilAtual(c);

  const { data: pedido } = await c
    .from("orders").select("status_pedido, forma_pagamento, status_pagamento")
    .eq("id", pedidoId).maybeSingle();
  if (!pedido) return { ok: false, erro: "Pedido não encontrado." };

  const atual = pedido.status_pedido as PedidoStatus;
  if (!PROXIMO_PERMITIDO[atual].includes(status)) {
    return { ok: false, erro: `Um pedido ${atual} não pode ir direto para ${status}.` };
  }

  if (status === "confirmado") {
    const { error } = await c.rpc("confirmar_pedido", {
      p_order_id: pedidoId, p_usuario_id: usuarioId,
    });
    if (error) return { ok: false, erro: traduzirErroBanco(error) };
  } else {
    const campos: Record<string, string> = {};
    const agora = new Date().toISOString();
    if (status === "em_separacao") campos.separado_em = agora;
    if (status === "saiu_para_entrega") campos.despachado_em = agora;
    if (status === "entregue") campos.entregue_em = agora;

    const { error } = await c.from("orders")
      .update({ status_pedido: status, ...campos }).eq("id", pedidoId);
    if (error) return { ok: false, erro: traduzirErroBanco(error) };

    await avisarClienteDoStatus(pedidoId, status);

    // Dinheiro na entrega: entregar É receber. Sem isto a tela mostrava
    // "pago" por um instante e o financeiro nunca via o dinheiro entrar.
    if (status === "entregue" && pedido.forma_pagamento === "dinheiro"
        && pedido.status_pagamento !== "aprovado") {
      const { error: erroPagamento } = await c.rpc("receber_na_entrega", {
        p_order_id: pedidoId, p_usuario_id: usuarioId,
      });
      if (erroPagamento) {
        return {
          ok: false,
          erro: `Pedido entregue, mas o recebimento não foi registrado: ${erroPagamento.message}`,
        };
      }
    }
  }
  revalidatePath("/pedidos");
  revalidatePath("/kanban");
  revalidatePath(`/pedidos/${pedidoId}`);
  return { ok: true };
}

export async function cancelarPedido(pedidoId: string, motivo: string): Promise<Resultado> {
  const c = await cli();
  if (!c) {
    demoAlterarStatusPedido(pedidoId, "cancelado");
    demoReabrirLeadDoPedido(pedidoId);
  } else {
    const { data: user } = await c.auth.getUser();
    const { error } = await c.rpc("cancelar_pedido", {
      p_order_id: pedidoId, p_motivo: motivo, p_usuario_id: user?.user?.id ?? null,
    });
    if (error) return { ok: false, erro: traduzirErroBanco(error) };
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
      const { data: user } = await c.auth.getUser();
      const { error } = await c.rpc("mover_estoque", {
        p_product_flavor_id: pfId,
        p_tipo: delta > 0 ? "ajuste_positivo" : "ajuste_negativo",
        p_quantidade: Math.abs(delta),
        p_referencia_tipo: "ajuste_manual",
        p_referencia_id: pfId,
        p_usuario_id: user?.user?.id ?? null,
        p_observacao: observacao ?? "Ajuste manual pelo painel",
      });
      if (error) return { ok: false, erro: traduzirErroBanco(error) };
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
    if (error) return { ok: false, erro: traduzirErroBanco(error) };
  }
  revalidatePath("/produtos");
  revalidatePath("/catalogo");
  return { ok: true };
}

/* ---------------------------------------------------------------- CARRINHO
 * Reservar o item ao colocar no carrinho é o que impede dois clientes
 * fecharem a última peça. Se o estoque não der, a reserva falha e nada
 * é gravado — o cliente descobre agora, não na hora de separar.
 * ------------------------------------------------------------------------ */

export interface ItemPedido {
  product_flavor_id: string;
  quantidade: number;
}

export interface DadosPedido {
  customer_id: string | null;
  conversation_id: string | null;
  address_id: string | null;
  /** endereço digitado na hora, quando o cliente ainda não tem nenhum salvo */
  endereco?: {
    bairro: string; rua: string; numero: string;
    complemento?: string; referencia?: string;
    /** opcional: a entrega é no bairro, não no CEP */
    cep?: string;
  };
  itens: ItemPedido[];
  forma_pagamento: "pix" | "dinheiro";
  troco_para?: number | null;
  observacoes?: string | null;
  /** código digitado pelo atendente; o desconto é recalculado no banco */
  cupom_codigo?: string | null;
}

/**
 * Cria o pedido inteiro numa transação: carrinho, reserva, pedido, itens,
 * financeiro e impressão. Se qualquer passo falhar, nada fica gravado.
 */
export async function criarPedido(
  dados: DadosPedido,
): Promise<Resultado & { id?: string; numero?: string }> {
  if (dados.itens.length === 0) {
    return { ok: false, erro: "Adicione ao menos um produto ao pedido." };
  }
  if (dados.forma_pagamento === "dinheiro" && dados.troco_para != null && dados.troco_para < 0) {
    return { ok: false, erro: "Valor do troco inválido." };
  }

  const c = await cli();

  if (!c) {
    const r = demoCriarPedido(dados);
    if (!r.ok) return r;
    revalidatePath("/pedidos");
    revalidatePath("/kanban");
    revalidatePath("/estoque");
    return r;
  }

  // o id do PERFIL, não o do Auth: quem entrou sem perfil grava null em vez
  // de estourar a chave estrangeira com uma mensagem que não ajuda ninguém
  const { id: usuarioId } = await perfilAtual(c);

  // 1) endereço novo, quando o cliente ainda não tem nenhum salvo
  let addressId = dados.address_id;
  if (!addressId && dados.endereco && dados.customer_id) {
    const { cep, ...resto } = dados.endereco;
    const { data: end, error } = await c.from("customer_addresses")
      .insert({
        customer_id: dados.customer_id,
        ...resto,
        // só grava o CEP se vier completo: meio CEP atrapalha mais que ajuda
        cep: cep && cep.replace(/\D/g, "").length === 8 ? cep : null,
        principal: true,
      })
      .select("id").single();
    if (error) {
      return { ok: false, erro: `Não consegui salvar o endereço: ${traduzirErroBanco(error)}` };
    }
    addressId = end.id;
  }

  // 2) carrinho
  const { data: cart, error: erroCarrinho } = await c.rpc("abrir_carrinho", {
    p_conversation_id: dados.conversation_id,
    p_customer_id: dados.customer_id,
    p_store_id: STORE_ID,
  });
  if (erroCarrinho || !cart) {
    return { ok: false, erro: traduzirErroBanco(erroCarrinho, "não consegui abrir o carrinho") };
  }

  // 3) itens, um a um: a reserva de cada um pode falhar por falta de estoque
  for (const item of dados.itens) {
    const { error } = await c.rpc("adicionar_ao_carrinho", {
      p_cart_id: cart.id,
      p_product_flavor_id: item.product_flavor_id,
      p_quantidade: item.quantidade,
    });
    if (error) return { ok: false, erro: traduzirErroBanco(error) };
  }

  // 4) o cupom, quando houver. Ele é amarrado ao carrinho e o desconto sai
  // de `recalcular_carrinho` no banco — a conta do desconto fica num lugar
  // só, senão painel e bot cobrariam diferente do mesmo cupom.
  if (dados.cupom_codigo?.trim()) {
    const { data: cupom } = await c.from("coupons")
      .select("id, codigo, tipo_desconto, valor, valor_minimo, status, inicio, fim, limite_total, usos")
      .eq("store_id", STORE_ID)
      .ilike("codigo", dados.cupom_codigo.trim())
      .maybeSingle();

    const { data: carrinho } = await c.from("carts")
      .select("subtotal").eq("id", cart.id).maybeSingle();

    const r = avaliarCupom(cupom as never, Number(carrinho?.subtotal ?? 0));
    if (!r.vale) return { ok: false, erro: r.motivo };

    const { error } = await c.from("carts")
      .update({ coupon_id: (cupom as { id: string }).id }).eq("id", cart.id);
    if (error) return { ok: false, erro: traduzirErroBanco(error) };
  }

  // 5) o carrinho vira pedido
  const { data: pedido, error: erroPedido } = await c.rpc("criar_pedido", {
    p_cart_id: cart.id,
    p_address_id: addressId,
    p_forma_pagamento: dados.forma_pagamento,
    p_troco_para: dados.troco_para ?? null,
    p_observacoes: dados.observacoes ?? null,
    p_atendente_id: usuarioId,
    p_origem: dados.conversation_id ? "bot" : "operador",
  });
  if (erroPedido || !pedido) {
    return { ok: false, erro: traduzirErroBanco(erroPedido, "não consegui criar o pedido") };
  }

  revalidatePath("/pedidos");
  revalidatePath("/kanban");
  revalidatePath("/estoque");
  revalidatePath("/entregas");
  return { ok: true, id: pedido.id, numero: pedido.numero_pedido };
}

/**
 * Envia o catálogo e liga o cronômetro do follow-up (ETAPA 04 e 05).
 *
 * O tempo sai das configurações, não do código: a loja ajusta sem deploy.
 */
export async function enviarCatalogo(conversationId: string): Promise<Resultado> {
  const c = await cli();

  let arquivo: string | null = null;
  let texto = "Esse é nosso catálogo 🖤 Me fala qual modelo te interessou que já mando os sabores disponíveis!";

  if (c) {
    const { data } = await c.from("settings")
      .select("valor").eq("store_id", STORE_ID).eq("chave", "catalogo").maybeSingle();
    arquivo = (data?.valor as { arquivo_png?: string } | undefined)?.arquivo_png ?? null;
  }

  if (!arquivo) {
    texto = "Me fala qual marca ou modelo você procura que já te mando os sabores disponíveis 🖤";
  }

  const envio = await enviarMensagem(conversationId, texto);
  if (!envio.ok) return envio;

  // marca o estado e agenda o retorno
  if (c) {
    await c.from("conversations")
      .update({ estado: "CATALOG_SENT" }).eq("id", conversationId);
  } else {
    const conversa = demo().conversas.find((x) => x.id === conversationId);
    if (conversa) conversa.estado = "CATALOG_SENT";
  }

  await agendarFollowup(conversationId);

  revalidatePath("/chats");
  return { ok: true };
}

/**
 * Baixa manual do PIX.
 *
 * Sem gateway, alguém confere o comprovante e marca aqui. A partir daí o
 * pedido pode ser confirmado — é a mesma trava de sempre: PIX só vira venda
 * com o dinheiro na conta.
 */
export async function confirmarPagamentoPix(pedidoId: string): Promise<Resultado> {
  const c = await cli();

  if (!c) {
    const pedido = demo().pedidos.find((p) => p.id === pedidoId);
    if (!pedido) return { ok: false, erro: "Pedido não encontrado." };
    pedido.status_pagamento = "aprovado";
    if (pedido.status_pedido === "aguardando_pagamento") {
      pedido.status_pedido = "confirmado";
      pedido.confirmado_em = new Date().toISOString();
    }
    revalidatePath("/pedidos");
    revalidatePath(`/pedidos/${pedidoId}`);
    return { ok: true };
  }

  // o id do PERFIL, não o do Auth: quem entrou sem perfil grava null em vez
  // de estourar a chave estrangeira com uma mensagem que não ajuda ninguém
  const { id: usuarioId } = await perfilAtual(c);

  const { error } = await c.from("orders")
    .update({ status_pagamento: "aprovado" }).eq("id", pedidoId);
  if (error) return { ok: false, erro: traduzirErroBanco(error) };

  await c.from("payments")
    .update({ status: "aprovado", pago_em: new Date().toISOString() })
    .eq("order_id", pedidoId).eq("status", "aguardando");

  // com o pagamento aprovado, a confirmação passa na trava e baixa o estoque
  const { error: erroConfirmacao } = await c.rpc("confirmar_pedido", {
    p_order_id: pedidoId, p_usuario_id: usuarioId,
  });
  if (erroConfirmacao) {
    return {
      ok: false,
      erro: `Pagamento marcado, mas o pedido não confirmou: ${erroConfirmacao.message}`,
    };
  }

  revalidatePath("/pedidos");
  revalidatePath("/entregas");
  revalidatePath(`/pedidos/${pedidoId}`);
  return { ok: true };
}

/**
 * Confere o cupom antes de fechar o pedido.
 *
 * Serve para o atendente ver o desconto na tela — quem aplica de verdade é o
 * banco, na criação do pedido. Duas contas separadas divergiriam.
 */
export async function conferirCupom(
  codigo: string, subtotal: number,
): Promise<{ ok: boolean; desconto?: number; erro?: string }> {
  if (!codigo.trim()) return { ok: false, erro: "Informe o código." };

  const c = supabaseConfigurado ? await getSupabaseServer() : null;

  if (!c) {
    const { demo2 } = await import("./demo-mvp2");
    const achado = demo2().cupons.find(
      (x) => x.codigo.toLowerCase() === codigo.trim().toLowerCase());
    const r = avaliarCupom(achado as never, subtotal);
    return r.vale ? { ok: true, desconto: r.desconto } : { ok: false, erro: r.motivo };
  }

  const { data: cupom } = await c.from("coupons")
    .select("id, codigo, tipo_desconto, valor, valor_minimo, status, inicio, fim, limite_total, usos")
    .eq("store_id", STORE_ID)
    .ilike("codigo", codigo.trim())
    .maybeSingle();

  const r = avaliarCupom(cupom as never, subtotal);
  return r.vale ? { ok: true, desconto: r.desconto } : { ok: false, erro: r.motivo };
}

/**
 * Apaga o pedido de vez — e só depois de cancelado.
 *
 * Cancelar e excluir fazem coisas diferentes, e a ordem importa: é o
 * cancelamento que devolve o estoque, cancela a conta a receber e lança o
 * estorno quando o dinheiro já entrou. Apagar a linha direto deixaria a peça
 * fora da prateleira e o dinheiro no caixa sem venda que o explique — e sem
 * nada no histórico para alguém descobrir depois.
 *
 * Então: cancela primeiro (a regra roda), apaga depois (se quiser mesmo).
 * Pedido entregue não some: é venda que aconteceu, e nota fiscal, troca e
 * garantia dependem dela existir.
 */
export async function excluirPedido(pedidoId: string): Promise<Resultado> {
  const c = supabaseConfigurado ? await getSupabaseServer() : null;

  if (!c) {
    const d = demo();
    d.pedidos = d.pedidos.filter((p) => p.id !== pedidoId);
    revalidatePath("/pedidos");
    return { ok: true };
  }

  const { data: pedido } = await c.from("orders")
    .select("numero_pedido, status_pedido, status_pagamento")
    .eq("id", pedidoId).maybeSingle();

  if (!pedido) return { ok: false, erro: "Pedido não encontrado." };

  if (pedido.status_pedido === "entregue") {
    return {
      ok: false,
      erro: `O pedido ${pedido.numero_pedido} foi entregue — é venda que aconteceu. `
        + `Troca, garantia e nota dependem dele existir.`,
    };
  }

  if (pedido.status_pedido !== "cancelado") {
    return {
      ok: false,
      erro: `Cancele o pedido ${pedido.numero_pedido} primeiro. É o cancelamento que `
        + `devolve o estoque e resolve o financeiro; apagar direto deixaria a peça `
        + `fora da prateleira sem explicação.`,
    };
  }

  // itens, histórico e contas apontam para o pedido; o que não tem cascade
  // sai antes, para a exclusão não falhar no meio
  await c.from("accounts_receivable").delete().eq("order_id", pedidoId);
  await c.from("order_status_history").delete().eq("order_id", pedidoId);
  await c.from("order_items").delete().eq("order_id", pedidoId);
  await c.from("payments").delete().eq("order_id", pedidoId);

  const { error } = await c.from("orders").delete().eq("id", pedidoId);
  if (error) return { ok: false, erro: traduzirErroBanco(error) };

  revalidatePath("/pedidos");
  revalidatePath("/financeiro");
  revalidatePath("/entregas");
  return { ok: true };
}
