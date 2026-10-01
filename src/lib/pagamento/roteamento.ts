import { MeioAsaas } from "./asaas";
import type { MeioPagamento } from "./tipos";

/**
 * De quem é este webhook.
 *
 * Fica separado do `index` de propósito: descobrir o provedor pelo corpo não
 * depende de configuração nem do servidor, e assim dá para testar sozinho.
 *
 * Corpo que não casa devolve null, e a rota responde 200 ignorando — formato
 * desconhecido não melhora com reenvio.
 */
export function meioDoWebhook(corpo: unknown): MeioPagamento | null {
  const c = corpo as Record<string, unknown>;
  if (!c) return null;

  // Asaas: { event: "PAYMENT_RECEIVED", payment: {...} }
  if (typeof c.event === "string" && c.event.startsWith("PAYMENT_") && c.payment) {
    return new MeioAsaas();
  }

  return null;
}
