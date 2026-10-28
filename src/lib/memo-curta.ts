/**
 * Guarda o resultado por alguns segundos.
 *
 * Uma mensagem do cliente lia o catálogo inteiro de 2 a 4 vezes e as
 * configurações de 3 a 5 — cada ferramenta do bot buscava de novo. O que
 * muda o estoque de verdade é conferido pelo banco na reserva, então ler a
 * mesma lista duas vezes no mesmo segundo só custava tempo.
 *
 * Chamadas simultâneas esperam a mesma busca, em vez de cada uma disparar a
 * sua.
 */
export function memoCurta<T>(validadeMs: number, buscar: () => Promise<T>): () => Promise<T> {
  let valor: T | undefined;
  let ate = 0;
  let emCurso: Promise<T> | null = null;

  return async () => {
    if (valor !== undefined && Date.now() < ate) return valor;
    if (emCurso) return emCurso;

    emCurso = buscar()
      .then((v) => { valor = v; ate = Date.now() + validadeMs; return v; })
      .finally(() => { emCurso = null; });
    return emCurso;
  };
}
