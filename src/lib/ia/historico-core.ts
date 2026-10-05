/**
 * A conversão do histórico em turnos de conversa — a parte pura.
 *
 * Mora fora de `historico.ts` porque aquele é `server-only` (fala com o
 * banco) e um módulo assim não carrega em teste. Aqui está toda a decisão:
 * quem vira `user`, quem vira `assistant`, o que é descartado.
 */
import type { Mensagem } from "./deepseek";

/** Não leva texto gigante para o prompt: catálogo colado vira ruído. */
const TETO_POR_MENSAGEM = 600;

const recortar = (t: string) =>
  t.length > TETO_POR_MENSAGEM ? `${t.slice(0, TETO_POR_MENSAGEM)}…` : t;

export interface Linha {
  sender_type: string;
  conteudo: string | null;
  tipo: string;
}

/** Separada e pura para dar para testar sem banco. */
export function converter(linhas: Linha[], textoAtual: string): Mensagem[] {
  const turnos: Mensagem[] = [];

  for (const l of linhas) {
    const texto = (l.conteudo ?? "").trim();
    if (!texto) continue;

    /**
     * 'sistema' fica fora: são avisos internos ("conversa importada do
     * WhatsApp", "bot pausado") que o cliente nunca viu. Dentro do
     * histórico o modelo os leria como fala de alguém.
     */
    if (l.sender_type === "sistema") continue;

    /**
     * O atendente entra como `assistant` junto com o bot, de propósito: do
     * lado do cliente é a mesma loja falando. Separar faria o modelo
     * contradizer o que uma pessoa acabou de prometer.
     */
    turnos.push(l.sender_type === "cliente"
      ? { role: "user", content: recortar(texto) }
      : { role: "assistant", content: recortar(texto) });
  }

  // a última mensagem do cliente já é a que estamos respondendo
  const ultimo = turnos.at(-1);
  if (ultimo?.role === "user" && ultimo.content === recortar(textoAtual.trim())) {
    turnos.pop();
  }

  return turnos;
}
