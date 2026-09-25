import "server-only";
import { getSupabaseServer } from "../supabase/server";
import { supabaseConfigurado } from "../supabase/config";
import { demo } from "../demo";
import { meioAtivo } from "./index";
import { registrarPagamento } from "./recepcao";

/**
 * "Já paguei" — perguntar ao provedor em vez de esperar o webhook.
 *
 * O webhook pode não chegar: provedor fora do ar, deploy no meio, rede. Sem
 * isto, um pedido pago fica parado até alguém desconfiar. A resposta entra
 * pela mesma recepção do webhook, então a conferência de valor e a
 * idempotência continuam valendo — não é um atalho para confirmar pedido.
 */
export async function conferirPagamentoDoPedido(
  pedidoId: string,
): Promise<{ pago: boolean; motivo?: string }> {
  const meio = meioAtivo();

  if (!meio.conferirPagamento) {
    return { pago: false, motivo: "Sem gateway, a baixa do PIX é manual." };
  }

  const c = supabaseConfigurado ? await getSupabaseServer() : null;

  const pedido = c
    ? (await c.from("orders")
        .select("numero_pedido, status_pagamento").eq("id", pedidoId).maybeSingle()).data
    : demo().pedidos.find((p) => p.id === pedidoId);

  if (!pedido) return { pago: false, motivo: "Pedido não encontrado." };
  if (pedido.status_pagamento === "aprovado") return { pago: true };

  const evento = await meio.conferirPagamento(String(pedido.numero_pedido));
  if (!evento) return { pago: false, motivo: "O provedor ainda não acusou o pagamento." };

  const r = await registrarPagamento(evento, meio.nome);
  return r.processado
    ? { pago: true }
    : { pago: false, motivo: r.motivo ?? "O pagamento não passou na conferência." };
}
