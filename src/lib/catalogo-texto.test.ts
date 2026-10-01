import { describe, it, expect } from "vitest";
import { agruparCatalogo, catalogoEmTexto, type ItemParaCatalogo } from "./catalogo-texto";

const item = (p: Partial<ItemParaCatalogo> = {}): ItemParaCatalogo => ({
  marca: "Ignite", produto: "Ignite V300", puffs: 3000, preco: 89.9,
  sabor: "Watermelon Ice", estoque_disponivel: 10, vendavel: true, ...p,
});

describe("o catálogo só mostra o que existe", () => {
  it("corta o que não é vendável", () => {
    const t = catalogoEmTexto([
      item({ sabor: "Tem" }),
      item({ sabor: "Produto inativo", vendavel: false }),
    ]);
    expect(t).toContain("Tem");
    expect(t).not.toContain("Produto inativo");
  });

  it("corta o que está com zero disponível", () => {
    // é a regra mais importante: oferecer o que acabou mata a venda e a
    // confiança do cliente de uma vez
    const t = catalogoEmTexto([
      item({ sabor: "Tem" }),
      item({ sabor: "Esgotado", estoque_disponivel: 0 }),
    ]);
    expect(t).not.toContain("Esgotado");
  });

  it("corta o que está todo reservado por outro cliente", () => {
    // disponível já é total menos reservado, então reserva de terceiro
    // chega aqui como zero — e não pode ser oferecida
    const t = catalogoEmTexto([item({ sabor: "Reservado", estoque_disponivel: 0 })]);
    expect(t).toContain("repondo o estoque");
  });

  it("estoque todo zerado devolve recado, não catálogo vazio", () => {
    expect(catalogoEmTexto([])).toContain("repondo o estoque");
    expect(catalogoEmTexto([item({ estoque_disponivel: 0 })])).toContain("repondo o estoque");
  });

  it("avisa as últimas unidades", () => {
    const t = catalogoEmTexto([
      item({ sabor: "Acabando", estoque_disponivel: 2 }),
      item({ sabor: "Sobrando", estoque_disponivel: 50 }),
    ]);
    expect(t).toContain("Acabando (últimas)");
    expect(t).toContain("Sobrando");
    expect(t).not.toContain("Sobrando (últimas)");
  });
});

describe("agrupamento", () => {
  it("junta sabores do mesmo produto numa linha", () => {
    const g = agruparCatalogo([
      item({ sabor: "Mango" }), item({ sabor: "Grape" }), item({ sabor: "Mint" }),
    ]);
    expect(g).toHaveLength(1);
    expect(g[0].produtos).toHaveLength(1);
    expect(g[0].produtos[0].sabores).toEqual(["Grape", "Mango", "Mint"]);
  });

  it("mostra o MENOR preço entre os sabores do produto", () => {
    // o catálogo não pode prometer menos do que o cliente vê ao escolher
    const g = agruparCatalogo([
      item({ sabor: "Barato", preco: 79.9 }),
      item({ sabor: "Caro", preco: 99.9 }),
    ]);
    expect(g[0].produtos[0].preco).toBe(79.9);
  });

  it("produto de mais puffs vem primeiro", () => {
    const g = agruparCatalogo([
      item({ produto: "V150", puffs: 1500 }),
      item({ produto: "V600", puffs: 6000 }),
    ]);
    expect(g[0].produtos.map((p) => p.produto)).toEqual(["V600", "V150"]);
  });

  it("marcas em ordem alfabética brasileira", () => {
    const g = agruparCatalogo([
      item({ marca: "Oxbar" }), item({ marca: "Elfbar" }), item({ marca: "Ãlfa" }),
    ]);
    expect(g.map((x) => x.marca)).toEqual(["Ãlfa", "Elfbar", "Oxbar"]);
  });

  it("sem marca cai em Outros, não desaparece", () => {
    const g = agruparCatalogo([item({ marca: null })]);
    expect(g[0].marca).toBe("Outros");
  });
});

describe("tamanho da mensagem", () => {
  it("corta a lista de sabores quando pedido, dizendo quantos sobraram", () => {
    const sabores = ["A","B","C","D","E","F","G","H"].map((s) => item({ sabor: s }));
    const t = catalogoEmTexto(sabores, { limiteSabores: 3 });
    expect(t).toContain("e mais 5");
  });

  it("sem limite mostra todos", () => {
    const sabores = ["A","B","C","D"].map((s) => item({ sabor: s }));
    expect(catalogoEmTexto(sabores)).not.toContain("e mais");
  });

  it("conta os sabores disponíveis no fim", () => {
    const t = catalogoEmTexto([item({ sabor: "A" }), item({ sabor: "B" })]);
    expect(t).toContain("2 sabores disponíveis agora");
  });
});
