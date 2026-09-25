import { MeioInfinitePay } from "./infinitepay";
import { MeioAsaas } from "./asaas";
import type { MeioPagamento } from "./tipos";

/**
 * De quem é este webhook.
 *
 * Fica separado do `index` de propósito: descobrir o provedor pelo corpo não
 * depende de configuração nem do servidor, e assim dá para testar sozinho.
 */
export function meioDoWebhook(corpo: unknown): MeioPagamento | null {
  const c = corpo as Record<string, unknown>;
  if (!c) return null;

  // Asaas: { event: "PAYMENT_RECEIVED", payment: {...} }
  if (typeof c.event === "string" && c.event.startsWith("PAYMENT_") && c.payment) {
    return new MeioAsaas();
  }

  // InfinitePay: os identificadores da transação vêm na raiz
  if (c.order_nsu || c.invoice_slug || c.transaction_nsu || c.orderNsu) {
    return new MeioInfinitePay();
  }

  return null;
}
