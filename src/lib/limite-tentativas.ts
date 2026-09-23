/**
 * Freio de tentativas de login.
 *
 * Guardado em memória do processo: some quando o servidor reinicia e não é
 * compartilhado entre instâncias. Serve para o uso real desta operação (um
 * punhado de pessoas) e para segurar um script bobo. Ataque distribuído de
 * verdade precisa de Redis — está anotado como o próximo passo.
 */

interface Registro {
  tentativas: number;
  primeira: number;
  bloqueadoAte?: number;
}

const registros = new Map<string, Registro>();

export interface Limite {
  /** quantas tentativas na janela antes de bloquear */
  max: number;
  /** tamanho da janela */
  janelaMs: number;
  /** quanto tempo fica bloqueado depois de estourar */
  bloqueioMs: number;
}

export const LIMITE_LOGIN: Limite = {
  max: 8,
  janelaMs: 10 * 60_000,
  bloqueioMs: 15 * 60_000,
};

export interface Resultado {
  permitido: boolean;
  restantes: number;
  /** segundos até poder tentar de novo */
  esperarSegundos?: number;
}

export function registrarTentativa(
  chave: string, limite: Limite = LIMITE_LOGIN, agora = Date.now(),
): Resultado {
  limpar(agora);

  const atual = registros.get(chave);

  if (atual?.bloqueadoAte && atual.bloqueadoAte > agora) {
    return {
      permitido: false,
      restantes: 0,
      esperarSegundos: Math.ceil((atual.bloqueadoAte - agora) / 1000),
    };
  }

  // janela vencida ou primeira tentativa: começa a contar de novo
  if (!atual || agora - atual.primeira > limite.janelaMs) {
    registros.set(chave, { tentativas: 1, primeira: agora });
    return { permitido: true, restantes: limite.max - 1 };
  }

  const tentativas = atual.tentativas + 1;

  if (tentativas > limite.max) {
    registros.set(chave, {
      tentativas, primeira: atual.primeira, bloqueadoAte: agora + limite.bloqueioMs,
    });
    return {
      permitido: false,
      restantes: 0,
      esperarSegundos: Math.ceil(limite.bloqueioMs / 1000),
    };
  }

  registros.set(chave, { ...atual, tentativas });
  return { permitido: true, restantes: limite.max - tentativas };
}

/** Login deu certo: zera o contador daquela chave. */
export function limparTentativas(chave: string) {
  registros.delete(chave);
}

/** Remove registros vencidos para o mapa não crescer sem parar. */
function limpar(agora: number) {
  if (registros.size < 500) return;
  for (const [chave, r] of registros) {
    const vencido = agora - r.primeira > LIMITE_LOGIN.janelaMs;
    const desbloqueado = !r.bloqueadoAte || r.bloqueadoAte < agora;
    if (vencido && desbloqueado) registros.delete(chave);
  }
}

/** Só para teste. */
export function zerarTudo() {
  registros.clear();
}
