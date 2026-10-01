import { MeioEstatico } from "./estatico";
import { MeioAsaas } from "./asaas";
import type { MeioPagamento } from "./tipos";

export * from "./tipos";
export { meioDoWebhook } from "./roteamento";
export { MeioEstatico, MeioAsaas };

/**
 * Qual meio de pagamento está no ar.
 *
 *   Asaas     copia e cola no chat + confirma sozinho por webhook
 *   estático  copia e cola, com baixa manual
 *
 * Sem o Asaas configurado a loja continua vendendo — só alguém confere o
 * comprovante. É por isso que o estático nunca sai do caminho.
 */
export function meioAtivo(): MeioPagamento {
  const asaas = new MeioAsaas();
  if (asaas.configurado()) return asaas;

  return new MeioEstatico();
}
