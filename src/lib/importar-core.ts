/**
 * As decisões da importação de conversas — sem banco e sem rede.
 *
 * Mora fora de `actions-importar.ts` porque aquele é um módulo `"use server"`
 * que fala com o Supabase, e nada ali daria para testar. O que erra em
 * importação não é a escrita: é classificar quem falou e decidir o que fazer
 * com conversa que já existe.
 */

/** Como cada provedor entrega um fio de conversa, depois de normalizado. */
export interface ChatNormalizado {
  telefone: string;
  nome?: string;
  naoLidas: number;
  ultimaEm?: Date;
  arquivado: boolean;
  /** id da conversa no provedor, quando ele tem histórico para buscar */
  idExterno?: string;
  /** fim da janela de 24h da Meta; fora dela só sai modelo aprovado */
  janelaAte?: Date | null;
}

export interface MensagemHistorica {
  idExterno: string;
  /** quem falou, do ponto de vista de quem lê o painel */
  autor: "cliente" | "bot" | "atendente";
  texto: string;
  em: Date;
}

/**
 * Quem falou, numa mensagem que veio do histórico.
 *
 * `outbound` sozinho não diz nada: pode ter saído do sistema (bot) ou do
 * dedo do dono no aplicativo do celular (atendente). Marcar tudo como bot
 * faria o relatório de atendimento creditar ao robô o trabalho da pessoa —
 * e o contrário esconderia o que o bot fez.
 */
export function classificarAutor(m: {
  direction?: string;
  sent_from_phone?: boolean;
}): MensagemHistorica["autor"] {
  if (m.direction === "inbound") return "cliente";
  return m.sent_from_phone ? "atendente" : "bot";
}

/**
 * A janela de 24 horas da Meta.
 *
 * Fora dela a API recusa qualquer mensagem livre com 422 `window_closed`, e
 * só passa modelo aprovado. A tela precisa saber disso ANTES de alguém
 * escrever, senão a pessoa digita, aperta enviar e a mensagem morre na fila
 * sem explicação.
 */
export function janelaAberta(ate: Date | null | undefined, agora = new Date()): boolean {
  if (!ate) return false;
  return ate.getTime() > agora.getTime();
}

/** Texto da prévia de uma conversa importada sem nenhuma mensagem. */
export function previaSemHistorico(naoLidas: number): string {
  return naoLidas > 0
    ? "(mensagens não lidas no WhatsApp)"
    : "(conversa importada do WhatsApp)";
}

/**
 * Quantas conversas vale buscar histórico numa importação.
 *
 * Cada histórico é uma chamada assinada à parte. Cem conversas seriam cem
 * chamadas, e a ação do servidor estoura o tempo antes de terminar — o
 * usuário veria erro depois de a metade já ter entrado. Vinte cobre quem
 * conversou nos últimos dias, que é quem o atendente vai abrir hoje; o resto
 * se preenche conforme as pessoas escreverem.
 */
export const TETO_DE_HISTORICOS = 20;

/** As mais recentes primeiro: são as que alguém vai abrir. */
export function escolherParaHistorico<T extends { ultimaEm?: Date }>(
  chats: T[],
  teto = TETO_DE_HISTORICOS,
): T[] {
  return [...chats]
    .sort((a, b) => (b.ultimaEm?.getTime() ?? 0) - (a.ultimaEm?.getTime() ?? 0))
    .slice(0, teto);
}
