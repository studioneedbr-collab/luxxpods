"use client";

import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";

/**
 * Lista que o servidor manda, com edição otimista em cima.
 *
 * `useState(props)` guarda o valor só na montagem e ignora toda prop nova
 * depois. Era por isso que criar qualquer coisa parecia não salvar: a ação
 * gravava e o Next devolvia a lista nova no mesmo roundtrip, mas a tela
 * continuava mostrando o item provisório, com um id `tmp-…` que o servidor
 * nunca viu. Editar ou excluir esse item falhava, e só um refresh manual
 * mostrava o registro de verdade.
 *
 * Aqui a lista volta a seguir o servidor sempre que ele manda outra — sem
 * efeito, ajustando durante a renderização, que é o jeito recomendado.
 */
export function useListaServidor<T>(
  doServidor: T,
): [T, Dispatch<SetStateAction<T>>] {
  const [lista, setLista] = useState(doServidor);
  const [ultimaVista, setUltimaVista] = useState(doServidor);

  if (doServidor !== ultimaVista) {
    setUltimaVista(doServidor);
    setLista(doServidor);
  }

  return [lista, setLista];
}
