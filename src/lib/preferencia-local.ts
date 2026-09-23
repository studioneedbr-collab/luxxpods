"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Preferência do operador guardada no navegador (seções recolhidas, etc).
 * Usa `useSyncExternalStore` para ler o storage sem efeito e sem quebrar a
 * hidratação: o servidor devolve o valor inicial e o cliente reassume depois.
 */
function criarStore<T>(chave: string, inicial: T) {
  let cache: T = inicial;
  let carregado = false;
  const ouvintes = new Set<() => void>();

  const ler = (): T => {
    if (!carregado) {
      carregado = true;
      try {
        const bruto = localStorage.getItem(chave);
        if (bruto) cache = JSON.parse(bruto) as T;
      } catch {
        /* navegador sem storage: segue com o valor inicial */
      }
    }
    return cache;
  };

  return {
    assinar(fn: () => void) {
      ouvintes.add(fn);
      return () => { ouvintes.delete(fn); };
    },
    ler,
    lerNoServidor: () => inicial,
    gravar(valor: T) {
      cache = valor;
      try { localStorage.setItem(chave, JSON.stringify(valor)); } catch { /* ignora */ }
      ouvintes.forEach((fn) => fn());
    },
  };
}

const stores = new Map<string, ReturnType<typeof criarStore<unknown>>>();

export function usePreferencia<T>(chave: string, inicial: T): [T, (v: T) => void] {
  if (!stores.has(chave)) {
    stores.set(chave, criarStore(chave, inicial) as ReturnType<typeof criarStore<unknown>>);
  }
  const store = stores.get(chave)! as ReturnType<typeof criarStore<T>>;

  const valor = useSyncExternalStore(store.assinar, store.ler, store.lerNoServidor);
  const gravar = useCallback((v: T) => store.gravar(v), [store]);

  return [valor, gravar];
}
