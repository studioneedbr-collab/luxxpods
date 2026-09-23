import { describe, expect, it } from "vitest";
import { FERRAMENTAS, paraFormatoAnthropic, validarChamada } from "./ferramentas";

describe("ferramentas do bot", () => {
  it("recusa ferramenta que não existe", () => {
    const r = validarChamada("deletar_tudo", {}, "CART");
    expect(r.valida).toBe(false);
    expect(r.erro).toContain("não existe");
  });

  it("recusa ferramenta fora do estado certo", () => {
    const r = validarChamada("confirmar_pedido", {}, "INITIAL");
    expect(r.valida).toBe(false);
    expect(r.erro).toContain("não pode ser usada");
  });

  it("exige os argumentos obrigatórios", () => {
    const r = validarChamada("adicionar_carrinho", { produto: "Ignite V300" }, "CART");
    expect(r.valida).toBe(false);
    expect(r.erro).toContain("sabor");
  });

  it("aceita chamada completa e no estado certo", () => {
    const r = validarChamada(
      "adicionar_carrinho",
      { produto: "Ignite V300", sabor: "Watermelon Ice", quantidade: 2 },
      "CART",
    );
    expect(r.valida).toBe(true);
  });

  it("recusa quantidade absurda", () => {
    const base = { produto: "X", sabor: "Y" };
    expect(validarChamada("adicionar_carrinho", { ...base, quantidade: 0 }, "CART").valida)
      .toBe(false);
    expect(validarChamada("adicionar_carrinho", { ...base, quantidade: 999 }, "CART").valida)
      .toBe(false);
    expect(validarChamada("adicionar_carrinho", { ...base, quantidade: 1.5 }, "CART").valida)
      .toBe(false);
  });

  it("recusa forma de pagamento inventada", () => {
    expect(validarChamada("criar_pagamento", { forma: "bitcoin" }, "PAYMENT").valida)
      .toBe(false);
    expect(validarChamada("criar_pagamento", { forma: "pix" }, "PAYMENT").valida)
      .toBe(true);
  });

  it("recusa argumento do tipo errado", () => {
    const r = validarChamada(
      "adicionar_carrinho",
      { produto: "X", sabor: "Y", quantidade: "dois" },
      "CART",
    );
    expect(r.valida).toBe(false);
  });

  // nenhuma ferramenta que escreve pode valer em qualquer estado
  it("toda ferramenta de escrita crítica declara onde vale", () => {
    const criticas = ["adicionar_carrinho", "confirmar_pedido", "criar_pagamento",
                      "cadastrar_endereco", "remover_carrinho"];
    FERRAMENTAS.filter((f) => criticas.includes(f.nome)).forEach((f) => {
      expect(f.estados, `${f.nome} precisa declarar estados`).toBeDefined();
    });
  });

  it("exporta no formato de tools da Anthropic", () => {
    const tools = paraFormatoAnthropic();
    expect(tools.length).toBe(FERRAMENTAS.length);
    const carrinho = tools.find((t) => t.name === "adicionar_carrinho")!;
    expect(carrinho.input_schema.required).toEqual(["produto", "sabor", "quantidade"]);
  });
});
