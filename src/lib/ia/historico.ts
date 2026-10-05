import "server-only";
import { clienteDoSistema } from "../supabase/sistema";
import { demo } from "../demo";
import { converter, type Linha } from "./historico-core";
import type { Mensagem } from "./deepseek";

/**
 * A memória da conversa.
 *
 * Sem isto o modelo só via a mensagem da vez, e isso o deixava burro de um
 * jeito que o cliente sente: "e o de 20000?" não quer dizer nada sozinho, e
 * "pode ser esse mesmo" muito menos. Ele respondia pedindo para repetir, ou
 * pior, chutava.
 *
 * Vai como turno de conversa de verdade — `user` e `assistant` — e não como
 * um bloco de texto colado no prompt. É o formato que o modelo foi treinado
 * a ler, e mantém o prompt estável no começo, onde o cache da DeepSeek pega.
 */

/**
 * Quantas mensagens voltar.
 *
 * Vinte cobre a conversa inteira de uma venda de pod — do "oi" ao PIX — sem
 * arrastar a compra da semana passada para dentro desta. Conversa de loja é
 * curta; o que vem antes disso é outro assunto e só confundiria.
 */
const QUANTAS = 20;

/**
 * Lê com o cliente de sistema: quem chama é o bot, a partir de um webhook,
 * sem ninguém logado. Com o cliente de sessão o RLS devolveria zero linha e
 * o modelo voltaria a ser amnésico sem ninguém notar.
 */
export async function historicoDaConversa(
  conversationId: string,
  /** a mensagem que está sendo respondida agora; não entra duas vezes */
  textoAtual: string,
): Promise<Mensagem[]> {
  const c = await clienteDoSistema();

  let linhas: Linha[] = [];

  if (!c) {
    const conversa = demo().conversas.find((x) => x.id === conversationId);
    linhas = ((conversa as { mensagens?: Linha[] } | undefined)?.mensagens ?? [])
      .slice(-QUANTAS);
  } else {
    const { data, error } = await c.from("messages")
      .select("sender_type, conteudo, tipo")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(QUANTAS);

    if (error) {
      // sem memória o bot fica pior, não quebrado: segue com a mensagem da vez
      console.warn(`[luxx:ia] não li o histórico: ${error.message}`);
      return [];
    }

    linhas = (data ?? []).reverse() as Linha[];
  }

  return converter(linhas, textoAtual);
}
