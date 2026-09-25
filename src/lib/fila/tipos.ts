/**
 * Fila de trabalho.
 *
 * Nada que demora ou que pode falhar roda dentro da requisição: entra aqui e
 * um worker pega depois. É o que permite tentar de novo sem o cliente ficar
 * esperando, e o que faz o follow-up de 5 minutos existir.
 */

export type TipoJob =
  | "enviar_mensagem"
  | "followup_catalogo"
  | "imprimir_pedido"
  | "avisar_status_pedido"
  | "liberar_reservas"
  | "processar_webhook";

export interface Job {
  id: number;
  tipo: TipoJob;
  payload: Record<string, unknown>;
  conversation_id: string | null;
  executar_em: string;
  status: "pendente" | "processando" | "concluido" | "cancelado" | "erro";
  tentativas: number;
  erro: string | null;
}

export interface ResultadoJob {
  ok: boolean;
  erro?: string;
  /** false encerra de vez: insistir não vai resolver */
  tentarDeNovo?: boolean;
  /** quando o próprio job decide que não precisa mais rodar */
  cancelado?: boolean;
  detalhe?: string;
}

/** Quantas vezes insistir antes de desistir, por tipo. */
export const MAX_TENTATIVAS: Record<TipoJob, number> = {
  enviar_mensagem: 4,
  followup_catalogo: 2,
  imprimir_pedido: 5,
  avisar_status_pedido: 3,
  liberar_reservas: 2,
  processar_webhook: 3,
};

/**
 * Espera antes da próxima tentativa, crescendo a cada falha.
 * Insistir de segundo em segundo num canal fora do ar só piora.
 */
export function esperaAteProxima(tentativas: number): number {
  const segundos = Math.min(15 * 60, 30 * Math.pow(2, tentativas));
  return segundos * 1000;
}
