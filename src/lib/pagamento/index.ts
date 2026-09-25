import { MeioEstatico } from "./estatico";
import { MeioInfinitePay } from "./infinitepay";
import { MeioAsaas } from "./asaas";
import type { MeioPagamento } from "./tipos";

export * from "./tipos";
export { meioDoWebhook } from "./roteamento";
export { MeioEstatico, MeioInfinitePay, MeioAsaas };

/**
 * Qual meio de pagamento está no ar.
 *
 * A ordem não é gosto, é o que cada um entrega para quem vende no WhatsApp:
 *
 *   Asaas       copia e cola no chat + confirma sozinho
 *   InfinitePay confirma sozinho, mas o cliente precisa abrir um link
 *   estático    copia e cola, com baixa manual
 *
 * Sem nenhum gateway a loja continua vendendo — só alguém confere o
 * comprovante. É por isso que o estático nunca sai do caminho.
 */
export function meioAtivo(): MeioPagamento {
  const asaas = new MeioAsaas();
  if (asaas.configurado()) return asaas;

  const infinitepay = new MeioInfinitePay();
  if (infinitepay.configurado()) return infinitepay;

  return new MeioEstatico();
}
