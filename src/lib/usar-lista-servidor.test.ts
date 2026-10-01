import { describe, it, expect } from "vitest";

/**
 * O sincronizador é um hook, mas a regra que ele implementa é simples e vale
 * ser travada: quando a lista do servidor muda de identidade, a lista local
 * volta a ser ela; quando não muda, a edição local sobrevive.
 */
function decidir<T>(doServidor: T, ultimaVista: T, local: T): { lista: T; resetou: boolean } {
  if (doServidor !== ultimaVista) return { lista: doServidor, resetou: true };
  return { lista: local, resetou: false };
}

describe("lista do servidor com edição otimista", () => {
  it("servidor manda lista nova: a local é descartada", () => {
    // é este o caso que estava quebrado — o item com id tmp- ficava na tela
    const antiga = [{ id: "a" }];
    const comProvisorio = [{ id: "a" }, { id: "tmp-1" }];
    const nova = [{ id: "a" }, { id: "real-2" }];

    const r = decidir(nova, antiga, comProvisorio);
    expect(r.resetou).toBe(true);
    expect(r.lista).toBe(nova);
    expect(r.lista.some((x) => x.id.startsWith("tmp-"))).toBe(false);
  });

  it("servidor manda a mesma lista: a edição local fica", () => {
    const doServidor = [{ id: "a" }];
    const editado = [{ id: "a", mudou: true }];
    const r = decidir(doServidor, doServidor, editado as unknown as typeof doServidor);
    expect(r.resetou).toBe(false);
    expect(r.lista).toBe(editado);
  });

  it("lista vazia que continua vazia não reseta a cada render", () => {
    // mesma referência: o servidor não mandou nada novo
    const vazia: unknown[] = [];
    expect(decidir(vazia, vazia, vazia).resetou).toBe(false);
  });
});
