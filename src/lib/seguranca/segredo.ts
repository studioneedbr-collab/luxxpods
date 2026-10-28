import { timingSafeEqual } from "node:crypto";

/**
 * Comparação de segredo de webhook.
 *
 * Duas regras que a auditoria cobrou:
 *
 * - SEM SEGREDO CONFIGURADO, EM PRODUÇÃO, NADA PASSA. Antes "sem segredo"
 *   significava "aceita tudo": qualquer pessoa na internet forjava mensagem
 *   de cliente pelo webhook do WhatsApp, ou um "pagamento aprovado" que
 *   confirmava pedido sem dinheiro. Fora de produção continua aberto, para
 *   dar para testar sem configurar nada.
 * - comparação em tempo constante: `===` deixa medir quantos caracteres
 *   batem pelo tempo de resposta.
 */
export function segredoConfere(esperado: string | undefined, recebido: string | null): boolean {
  if (!esperado) return process.env.NODE_ENV !== "production";
  if (!recebido) return false;

  const a = Buffer.from(esperado);
  const b = Buffer.from(recebido);
  return a.length === b.length && timingSafeEqual(a, b);
}
