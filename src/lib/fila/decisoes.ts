/**
 * As decisões da fila, sem I/O.
 *
 * Ficam separadas do worker porque são as regras que não podem errar — e
 * regra sem teste é regra que volta a quebrar na próxima mudança.
 */

import { MAX_TENTATIVAS, type TipoJob } from "./tipos";

/* ------------------------------------------------------------- FOLLOW-UP */

export interface EstadoConversa {
  bot_ativo: boolean;
  /** última vez que o CLIENTE escreveu */
  ultima_interacao_cliente: string | null;
}

export type DecisaoFollowup =
  | { enviar: true }
  | { enviar: false; motivo: string };

/**
 * O follow-up olha a conversa AGORA, não como ela estava quando foi agendado.
 *
 * Mandar "conseguiu ver?" para quem acabou de responder é o jeito mais rápido
 * de parecer robô — e de fazer o cliente parar de responder.
 */
export function decidirFollowup(
  conversa: EstadoConversa | null,
  agendadoApos: Date,
): DecisaoFollowup {
  if (!conversa) return { enviar: false, motivo: "conversa não existe mais" };

  if (!conversa.bot_ativo) {
    return { enviar: false, motivo: "um atendente assumiu a conversa" };
  }

  if (conversa.ultima_interacao_cliente) {
    const respondeu = new Date(conversa.ultima_interacao_cliente);
    if (respondeu > agendadoApos) {
      return { enviar: false, motivo: "o cliente respondeu" };
    }
  }

  return { enviar: true };
}

/* --------------------------------------------------------- NOVA TENTATIVA */

export interface DecisaoTentativa {
  /** pendente = tenta de novo; erro = desiste; cancelado = não era para ter rodado */
  status: "pendente" | "erro" | "cancelado";
  reagendar: boolean;
}

/**
 * Insistir ou desistir.
 *
 * Erro de conteúdo (número inválido, texto vazio) não melhora com repetição —
 * só enche a fila e atrasa o que tem conserto. Erro de rede, sim.
 */
export function decidirTentativa(
  tipo: TipoJob,
  tentativasFeitas: number,
  resultado: { ok: boolean; cancelado?: boolean; tentarDeNovo?: boolean },
): DecisaoTentativa {
  if (resultado.cancelado) return { status: "cancelado", reagendar: false };
  if (resultado.ok) return { status: "pendente", reagendar: false };

  if (resultado.tentarDeNovo === false) return { status: "erro", reagendar: false };

  const limite = MAX_TENTATIVAS[tipo] ?? 3;
  if (tentativasFeitas + 1 >= limite) return { status: "erro", reagendar: false };

  return { status: "pendente", reagendar: true };
}
