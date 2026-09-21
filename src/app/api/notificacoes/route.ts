import { NextResponse } from "next/server";
import { getCatalogo, getConversas, getPedidos, getTarefas } from "@/lib/data";
import { getLancamentos, getTrocas } from "@/lib/data-mvp2";

export const dynamic = "force-dynamic";

export interface Notificacao {
  id: string;
  tipo: "conversa" | "tarefa" | "estoque" | "pedido" | "financeiro" | "troca";
  prioridade: "alta" | "media" | "baixa";
  titulo: string;
  detalhe: string;
  href: string;
  quando?: string;
}

/**
 * Central de notificações (§49 do escopo).
 * Deriva os eventos do estado atual da operação, sem tabela extra.
 */
export async function GET() {
  const [conversas, tarefas, catalogo, pedidos, lancamentos, trocas] = await Promise.all([
    getConversas(), getTarefas(), getCatalogo(), getPedidos(200),
    getLancamentos("pagar"), getTrocas(),
  ]);

  const avisos: Notificacao[] = [];
  const agora = Date.now();
  const hoje = new Date().toISOString().slice(0, 10);

  /* ---------------- atendimento ---------------- */
  const naoRespondidas = conversas.filter((c) => c.nao_lidas > 0);
  if (naoRespondidas.length > 0) {
    const maisAntiga = [...naoRespondidas].sort(
      (a, b) => +new Date(a.ultima_mensagem_em ?? 0) - +new Date(b.ultima_mensagem_em ?? 0))[0];
    avisos.push({
      id: "conversas-nao-respondidas",
      tipo: "conversa",
      prioridade: "alta",
      titulo: `${naoRespondidas.length} conversa(s) sem resposta`,
      detalhe: `A mais antiga é de ${maisAntiga.cliente?.nome ?? "um cliente"}`,
      href: "/chats",
      quando: maisAntiga.ultima_mensagem_em ?? undefined,
    });
  }

  const comHumano = conversas.filter((c) => !c.bot_ativo && c.status === "aberta");
  if (comHumano.length > 0) {
    avisos.push({
      id: "conversas-com-atendente",
      tipo: "conversa",
      prioridade: "baixa",
      titulo: `${comHumano.length} conversa(s) com o bot pausado`,
      detalhe: "Devolva ao bot quando o atendimento terminar",
      href: "/chats",
    });
  }

  /* ---------------- tarefas ---------------- */
  const atrasadas = tarefas.filter(
    (t) => t.status === "aberta" && t.vencimento && +new Date(t.vencimento) < agora);
  if (atrasadas.length > 0) {
    avisos.push({
      id: "tarefas-atrasadas",
      tipo: "tarefa",
      prioridade: "alta",
      titulo: `${atrasadas.length} tarefa(s) atrasada(s)`,
      detalhe: atrasadas[0].titulo,
      href: "/tarefas",
    });
  }

  const doBot = tarefas.filter((t) => t.status === "aberta" && t.criada_por === "bot");
  if (doBot.length > 0) {
    avisos.push({
      id: "tarefas-do-bot",
      tipo: "tarefa",
      prioridade: "alta",
      titulo: `${doBot.length} pendência(s) aberta(s) pelo bot`,
      detalhe: doBot[0].titulo,
      href: "/tarefas",
    });
  }

  /* ---------------- estoque ---------------- */
  const esgotados = catalogo.filter((c) => c.estoque_disponivel <= 0 && c.sabor_ativo);
  if (esgotados.length > 0) {
    avisos.push({
      id: "estoque-esgotado",
      tipo: "estoque",
      prioridade: "alta",
      titulo: `${esgotados.length} SKU(s) esgotado(s)`,
      detalhe: "O bot deixou de oferecer estes sabores",
      href: "/estoque",
    });
  }

  const baixos = catalogo.filter(
    (c) => c.estoque_disponivel > 0 && c.estoque_disponivel <= c.estoque_minimo);
  if (baixos.length > 0) {
    avisos.push({
      id: "estoque-baixo",
      tipo: "estoque",
      prioridade: "media",
      titulo: `${baixos.length} SKU(s) no estoque mínimo`,
      detalhe: `${baixos[0].produto} · ${baixos[0].sabor}`,
      href: "/estoque",
    });
  }

  /* ---------------- pedidos ---------------- */
  const paraSeparar = pedidos.filter((p) => p.status_pedido === "confirmado");
  if (paraSeparar.length > 0) {
    avisos.push({
      id: "pedidos-para-separar",
      tipo: "pedido",
      prioridade: "media",
      titulo: `${paraSeparar.length} pedido(s) aguardando separação`,
      detalhe: paraSeparar[0].numero_pedido,
      href: "/entregas",
    });
  }

  const parados = pedidos.filter(
    (p) => p.status_pedido === "saiu_para_entrega" &&
           agora - +new Date(p.despachado_em ?? p.created_at) > 2 * 3600e3);
  if (parados.length > 0) {
    avisos.push({
      id: "pedidos-parados",
      tipo: "pedido",
      prioridade: "alta",
      titulo: `${parados.length} entrega(s) há mais de 2h em rota`,
      detalhe: parados[0].numero_pedido,
      href: "/entregas",
    });
  }

  const pixPendente = pedidos.filter(
    (p) => p.forma_pagamento === "pix" &&
           p.status_pagamento === "aguardando" &&
           p.status_pedido !== "cancelado");
  if (pixPendente.length > 0) {
    avisos.push({
      id: "pix-pendente",
      tipo: "financeiro",
      prioridade: "media",
      titulo: `${pixPendente.length} PIX aguardando confirmação`,
      detalhe: "Pedidos não confirmados até o pagamento cair",
      href: "/pedidos",
    });
  }

  /* ---------------- financeiro ---------------- */
  const vencidas = lancamentos.filter(
    (l) => l.status !== "pago" && l.vencimento && l.vencimento < hoje);
  if (vencidas.length > 0) {
    const total = vencidas.reduce((a, l) => a + l.valor, 0);
    avisos.push({
      id: "contas-vencidas",
      tipo: "financeiro",
      prioridade: "alta",
      titulo: `${vencidas.length} conta(s) vencida(s)`,
      detalhe: `Total de R$ ${total.toFixed(2).replace(".", ",")}`,
      href: "/financeiro/pagar",
    });
  }

  /* ---------------- trocas ---------------- */
  const trocasAbertas = trocas.filter(
    (t) => t.status === "solicitada" || t.status === "em_analise");
  if (trocasAbertas.length > 0) {
    avisos.push({
      id: "trocas-abertas",
      tipo: "troca",
      prioridade: "media",
      titulo: `${trocasAbertas.length} troca(s) aguardando análise`,
      detalhe: trocasAbertas[0].cliente_nome ?? "",
      href: "/trocas",
    });
  }

  const peso = { alta: 0, media: 1, baixa: 2 };
  avisos.sort((a, b) => peso[a.prioridade] - peso[b.prioridade]);

  return NextResponse.json({
    notificacoes: avisos,
    total: avisos.length,
    urgentes: avisos.filter((a) => a.prioridade === "alta").length,
  });
}
