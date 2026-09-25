import "server-only";
import { getSupabaseServer } from "../supabase/server";
import { STORE_ID, supabaseConfigurado } from "../supabase/config";
import { enfileirar } from "../fila/worker";
import { demo } from "../demo";
import { decidirPagamento } from "./conferencia-core";
import type { EventoPagamento } from "./tipos";

/**
 * O que acontece quando o dinheiro entra.
 *
 * Três cuidados que valem dinheiro:
 *   1. o mesmo evento não é processado duas vezes (o gateway reenvia);
 *   2. o valor recebido é conferido contra o pedido — confiar só no corpo
 *      do webhook é como aceitar o troco sem contar;
 *   3. a confirmação do pedido roda pela mesma função de sempre, então a
 *      baixa de estoque e o financeiro seguem a regra única.
 *
 * A decisão em si mora em `conferencia-core.ts`, pura e testada; aqui é só
 * a ida ao banco e o que fazer com cada resposta dela.
 */

export interface ResultadoPagamento {
  processado: boolean;
  motivo?: string;
  pedido?: string;
}

export async function registrarPagamento(
  evento: EventoPagamento,
  gateway: string,
): Promise<ResultadoPagamento> {
  const c = supabaseConfigurado ? await getSupabaseServer() : null;

  if (!c) return registrarNaDemo(evento, gateway);

  // 1) idempotência — o gateway reenvia quando não recebe resposta a tempo
  const { error: erroEvento } = await c.from("webhook_events").insert({
    origem: gateway,
    event_id: evento.id,
    payload: evento as unknown as Record<string, unknown>,
  });

  if (erroEvento) {
    if (erroEvento.code === "23505") {
      return { processado: false, motivo: "evento já processado" };
    }
    throw new Error(`falha ao registrar o evento: ${erroEvento.message}`);
  }

  // 2) acha o pedido pelo número público, que é o que viaja no gateway
  const colunas = "id, numero_pedido, total, status_pagamento, status_pedido, conversation_id";

  let pedido = evento.referenciaPedido
    ? (await c.from("orders").select(colunas)
        .eq("store_id", STORE_ID)
        .eq("numero_pedido", evento.referenciaPedido)
        .maybeSingle()).data
    : null;

  // o QR Code estático do Asaas identifica o pagamento pelo id do QR, não
  // pelo número do pedido; a cobrança que geramos guardou esse id
  if (!pedido && evento.referenciaAlternativa) {
    const { data: cobranca } = await c.from("payments")
      .select("order_id").eq("store_id", STORE_ID)
      .eq("transaction_id", evento.referenciaAlternativa)
      .maybeSingle();

    if (cobranca?.order_id) {
      pedido = (await c.from("orders").select(colunas)
        .eq("id", cobranca.order_id).maybeSingle()).data;
    }
  }

  // qual transação já pagou este pedido: é o que separa progressão de
  // status (o mesmo pagamento confirmando de novo) de cobrança dobrada
  const { data: jaAprovado } = pedido
    ? await c.from("payments").select("transaction_id")
        .eq("order_id", pedido.id).eq("status", "aprovado")
        .order("pago_em", { ascending: false }).limit(1).maybeSingle()
    : { data: null };

  const decisao = decidirPagamento(
    {
      total: pedido ? Number(pedido.total) : null,
      jaPago: pedido?.status_pagamento === "aprovado",
      transacaoPaga: jaAprovado?.transaction_id ?? null,
    },
    evento.situacao,
    evento.valor,
    evento.idTransacao,
  );

  if (!pedido) {
    await marcarProcessado(c, gateway, evento.id, decisao.acao === "recusar" ? decisao.motivo : undefined);
    return { processado: false, motivo: `pedido ${evento.referenciaPedido} não encontrado` };
  }

  const registrarCobranca = (status: string, pagoEm?: string) =>
    c.from("payments").upsert({
      store_id: STORE_ID, order_id: pedido.id, gateway,
      transaction_id: evento.idTransacao, metodo: evento.metodo,
      valor: evento.valor, status, ...(pagoEm ? { pago_em: pagoEm } : {}),
      payload: evento as unknown as Record<string, unknown>,
    }, { onConflict: "gateway,transaction_id" });

  // 3) evento que não é aprovação: fica registrado, não move o pedido
  if (decisao.acao === "registrar") {
    await registrarCobranca(
      evento.situacao === "estornado" ? "estornado"
        : evento.situacao === "recusado" ? "recusado" : "aguardando",
    );
    await marcarProcessado(c, gateway, evento.id);
    return { processado: true, motivo: decisao.motivo, pedido: pedido.numero_pedido };
  }

  // 4) recusa: guarda a cobrança como pendente e põe alguém para olhar
  if (decisao.acao === "recusar") {
    await registrarCobranca("aguardando");

    if (decisao.chamarGente) {
      const duplicado = decisao.motivo.startsWith("pedido já");
      await c.from("tasks").insert({
        store_id: STORE_ID,
        titulo: duplicado
          ? `Pagamento em duplicidade no pedido ${pedido.numero_pedido}`
          : `Valor divergente no pedido ${pedido.numero_pedido}`,
        descricao: duplicado
          ? `Chegou um segundo pagamento aprovado de R$ ${evento.valor.toFixed(2)} ` +
            `(transação ${evento.idTransacao}) num pedido que já estava pago. ` +
            `Confira se cabe estorno.`
          : `O gateway informou R$ ${evento.valor.toFixed(2)} mas o pedido é de ` +
            `R$ ${Number(pedido.total).toFixed(2)}. Confira antes de liberar.`,
        prioridade: "urgente", status: "aberta", criada_por: "sistema",
        order_id: pedido.id,
      });
    }

    await marcarProcessado(c, gateway, evento.id, decisao.motivo);
    return { processado: false, motivo: decisao.motivo, pedido: pedido.numero_pedido };
  }

  // 5) pagamento aprovado e conferido
  await registrarCobranca("aprovado", evento.em.toISOString());

  await c.from("orders")
    .update({ status_pagamento: "aprovado" }).eq("id", pedido.id);

  // a confirmação passa pela função de sempre: baixa estoque, gera o
  // financeiro e enfileira a impressão, com a mesma regra do resto
  if (pedido.status_pedido === "aguardando_pagamento" || pedido.status_pedido === "pendente") {
    const { error } = await c.rpc("confirmar_pedido", { p_order_id: pedido.id });
    if (error) {
      console.error(`[luxx] pagamento aprovado mas o pedido não confirmou: ${error.message}`);
      await c.from("tasks").insert({
        store_id: STORE_ID,
        titulo: `Pedido ${pedido.numero_pedido} pago mas não confirmado`,
        descricao: `O dinheiro entrou, mas a confirmação falhou: ${error.message}`,
        prioridade: "urgente", status: "aberta", criada_por: "sistema",
        order_id: pedido.id,
      });
    }
  }

  // avisar o cliente não segura a resposta ao gateway
  if (pedido.conversation_id) {
    await enfileirar(
      "avisar_status_pedido",
      {
        texto: `Pagamento confirmado ✅ Seu pedido ${pedido.numero_pedido} já entrou na fila 🖤`,
        order_id: pedido.id,
        natureza: "transacional",
      },
      { conversationId: pedido.conversation_id },
    );
  }

  await marcarProcessado(c, gateway, evento.id);
  return { processado: true, pedido: pedido.numero_pedido };
}

async function marcarProcessado(
  c: NonNullable<Awaited<ReturnType<typeof getSupabaseServer>>>,
  origem: string, eventId: string, erro?: string,
) {
  await c.from("webhook_events").update({
    processado: true,
    processado_em: new Date().toISOString(),
    erro: erro ?? null,
  }).eq("origem", origem).eq("event_id", eventId);
}

/**
 * Mesmo caminho na base de demonstração, para dar para testar o webhook.
 *
 * A idempotência aqui é feita na memória do processo, porque a tabela
 * `webhook_events` só existe no Supabase. Vale para o teste; em produção
 * quem garante é o índice único de (origem, event_id).
 */
const eventosVistos = new Map<string, ResultadoPagamento>();

function registrarNaDemo(evento: EventoPagamento, gateway: string): ResultadoPagamento {
  const chave = `${gateway}:${evento.id}`;
  const jaVisto = eventosVistos.get(chave);
  if (jaVisto) return { ...jaVisto, processado: false, motivo: "evento já processado" };

  const r = processarNaDemo(evento);
  eventosVistos.set(chave, r);
  if (eventosVistos.size > 500) {
    // a memória não pode crescer para sempre; o mais antigo sai
    eventosVistos.delete(eventosVistos.keys().next().value!);
  }
  return r;
}

/** qual transação pagou cada pedido, só na demonstração */
const transacaoDoPedido = new Map<string, string>();

function processarNaDemo(evento: EventoPagamento): ResultadoPagamento {
  const d = demo();
  const pedido = d.pedidos.find((p) => p.numero_pedido === evento.referenciaPedido);

  const decisao = decidirPagamento(
    {
      total: pedido ? pedido.total : null,
      jaPago: pedido?.status_pagamento === "aprovado",
      transacaoPaga: pedido ? transacaoDoPedido.get(pedido.id) ?? null : null,
    },
    evento.situacao,
    evento.valor,
    evento.idTransacao,
  );

  if (!pedido) return { processado: false, motivo: "pedido não encontrado" };
  if (decisao.acao === "registrar") {
    return { processado: true, motivo: decisao.motivo, pedido: pedido.numero_pedido };
  }
  if (decisao.acao === "recusar") {
    return { processado: false, motivo: decisao.motivo, pedido: pedido.numero_pedido };
  }

  pedido.status_pagamento = "aprovado";
  transacaoDoPedido.set(pedido.id, evento.idTransacao);
  if (pedido.status_pedido === "aguardando_pagamento") {
    pedido.status_pedido = "confirmado";
    pedido.confirmado_em = new Date().toISOString();
  }

  return { processado: true, pedido: pedido.numero_pedido };
}
