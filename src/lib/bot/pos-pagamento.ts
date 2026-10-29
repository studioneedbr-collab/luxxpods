import "server-only";
import { clienteDoSistema } from "../supabase/sistema";
import { enfileirar } from "../fila/worker";

/**
 * O PIX caiu: a conversa fica sabendo.
 *
 * Faltava este elo. O pedido confirmava no banco, mas o contexto da conversa
 * continuava com o pagamento "aguardando" — e a próxima mensagem do cliente
 * ouvia que o PIX ainda não tinha caído. Vale para os dois caminhos da
 * aprovação: o webhook do gateway e a baixa manual no painel.
 */
export async function avisarPagamentoAprovado(orderId: string): Promise<void> {
  const c = await clienteDoSistema();
  if (!c) return;

  const { data: pedido } = await c.from("orders")
    .select("numero_pedido, conversation_id, status_pedido")
    .eq("id", orderId).maybeSingle();
  if (!pedido?.conversation_id) return;

  const { data: conversa } = await c.from("conversations")
    .select("contexto, estado").eq("id", pedido.conversation_id).maybeSingle();

  const contexto = (conversa?.contexto ?? {}) as Record<string, unknown>;

  // só mexe na conversa se ela ainda está esperando ESTE pedido; se o
  // cliente já começou outra compra, o estado novo é dele
  if (contexto.order_id === orderId) {
    await c.from("conversations").update({
      estado: pedido.status_pedido === "cancelado" ? conversa?.estado : "ORDER_CONFIRMED",
      contexto: { ...contexto, pagamento_status: "aprovado" },
    }).eq("id", pedido.conversation_id);
  }

  await enfileirar(
    "avisar_status_pedido",
    {
      texto: `Pagamento confirmado ✅ Seu pedido ${pedido.numero_pedido} já entrou na fila 🖤`,
      order_id: orderId,
      natureza: "transacional",
    },
    { conversationId: pedido.conversation_id },
  );
}
