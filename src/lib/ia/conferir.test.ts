import { describe, expect, it } from "vitest";
import { conferirResposta, valoresNoTexto, type LeituraFeita } from "./conferir";

const leitura = (nome: string, dados: unknown): LeituraFeita =>
  ({ nome, ok: true, dados });

describe("valores afirmados no texto", () => {
  it("lê o formato brasileiro, com milhar e centavo", () => {
    expect(valoresNoTexto("sai por R$ 1.234,56")).toEqual(["1234.56"]);
  });

  it("lê preço redondo e 'reais' escrito", () => {
    expect(valoresNoTexto("R$ 45 ou 50 reais")).toEqual(["45.00", "50.00"]);
  });

  it("não acha dinheiro onde não tem", () => {
    expect(valoresNoTexto("tenho 3 sabores e 15000 puffs")).toEqual([]);
  });
});

describe("conferir a resposta do modelo", () => {
  it("passa o preço que saiu da consulta", () => {
    const r = conferirResposta(
      "O Ignite V150 sai por R$ 85,00 🖤",
      [leitura("consultar_preco", { produto: "Ignite V150", preco: 85 })],
    );
    expect(r.ok).toBe(true);
  });

  it("recusa o preço que o modelo inventou", () => {
    const r = conferirResposta(
      "Esse eu faço por R$ 70,00 pra você",
      [leitura("consultar_preco", { produto: "Ignite V150", preco: 85 })],
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("70,00");
  });

  /**
   * O catálogo vem como texto já formatado, com os preços dentro da string.
   * Se o conferidor só olhasse números de JSON, recusaria toda resposta
   * baseada no catálogo — que é o caso mais comum.
   */
  it("aceita preço que estava escrito dentro do texto do catálogo", () => {
    const r = conferirResposta(
      "O Lost Mary está R$ 90,00",
      [leitura("catalogo_completo", {
        texto: "LOST MARY\n- BM6000 · 6000 puffs · R$ 90,00\n  Blueberry, Watermelon",
      })],
    );
    expect(r.ok).toBe(true);
  });

  it("recusa a conta que o modelo fez de cabeça", () => {
    const r = conferirResposta(
      "São 2 unidades, dá R$ 170,00 no total",
      [leitura("consultar_preco", { preco: 85 })],
    );
    expect(r.ok).toBe(false);
  });

  it("recusa resposta vazia", () => {
    expect(conferirResposta("   ", [leitura("buscar_marcas", { marcas: ["Ignite"] })]).ok)
      .toBe(false);
  });

  it("recusa dizer que tem produto sem ter consultado nada", () => {
    const r = conferirResposta("Tenho sim, pode pedir!", []);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("disponibilidade");
  });

  it("deixa dizer que NÃO tem sem consultar — negar não arrisca venda", () => {
    expect(conferirResposta("Esse sabor eu não tenho agora", []).ok).toBe(true);
  });

  /**
   * Caso real: pedi ao modelo "adiciona 2 watermelon no carrinho" e ele
   * respondeu "Fechou, 2 Watermelon Ice 👌" sem nada ter sido reservado.
   */
  it("recusa dizer que separou ou reservou, porque ele não consegue", () => {
    for (const frase of [
      "Já separei 2 Watermelon Ice pra você",
      "Adicionei no seu carrinho 🖤",
      "Coloquei 1 Mint aqui, já reservei",
      "Anotei seu pedido, pode considerar fechado",
    ]) {
      const r = conferirResposta(frase, [leitura("buscar_sabores", { produto: "Ignite V150" })]);
      expect(r.ok, frase).toBe(false);
      if (!r.ok) expect(r.motivo).toContain("reservado");
    }
  });

  it("deixa ele dizer que NÃO separou, e perguntar antes", () => {
    const r = conferirResposta(
      "Ainda não separei nada. Confirma pra mim: Ignite V150 Watermelon Ice, 2 unidades?",
      [leitura("buscar_sabores", { produto: "Ignite V150" })],
    );
    expect(r.ok).toBe(true);
  });

  it("recusa anunciar que o PIX caiu sem consultar o pagamento", () => {
    const r = conferirResposta("Seu PIX caiu, já estou separando!", []);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("pagamento");
  });

  it("deixa falar do pagamento depois de consultar", () => {
    const r = conferirResposta(
      "O PIX ainda não caiu aqui, me avisa quando enviar",
      [leitura("consultar_pagamento", { pago: false })],
    );
    expect(r.ok).toBe(true);
  });

  it("deixa responder sobre a loja sem consulta nenhuma", () => {
    const r = conferirResposta("A entrega leva uns 45 minutos 🛵", []);
    expect(r.ok).toBe(true);
  });

  it("ignora o que veio de consulta que falhou", () => {
    const r = conferirResposta("Sai por R$ 85,00", [
      { nome: "consultar_preco", ok: false, dados: { preco: 85 } },
    ]);
    expect(r.ok).toBe(false);
  });
});
