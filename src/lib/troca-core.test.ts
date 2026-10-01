import { describe, it, expect } from "vitest";

/**
 * A conta da troca, travada em teste.
 *
 * A regra mora no banco (`finalizar_troca`), mas ela é fácil de inverter sem
 * ninguém notar — a versão anterior SOMAVA a peça defeituosa de volta à
 * prateleira vendável. Estes testes descrevem o efeito esperado em estoque,
 * para quem mexer depois ter onde bater.
 */
function efeitoDaTroca(
  estoqueAntes: number,
  quantidade: number,
  etapa: "solicitada" | "aprovada" | "finalizada",
): number {
  // só a finalização move estoque: antes dela ninguém entregou nada
  if (etapa !== "finalizada") return estoqueAntes;
  // a peça de REPOSIÇÃO sai; a defeituosa não reentra
  return estoqueAntes - quantidade;
}

describe("o que a troca faz no estoque", () => {
  it("troca aberta não mexe em nada", () => {
    expect(efeitoDaTroca(10, 1, "solicitada")).toBe(10);
  });

  it("troca aprovada também não: aprovar é conferir, não entregar", () => {
    expect(efeitoDaTroca(10, 1, "aprovada")).toBe(10);
  });

  it("finalizar BAIXA a peça de reposição", () => {
    // é o cliente levando a segunda unidade: o estoque sente
    expect(efeitoDaTroca(10, 1, "finalizada")).toBe(9);
  });

  it("a peça com defeito NÃO volta para a prateleira", () => {
    // a versão anterior fazia +1 aqui, devolvendo peça defeituosa ao
    // estoque vendável — o bot voltaria a oferecer o que não presta
    expect(efeitoDaTroca(10, 1, "finalizada")).not.toBe(11);
    expect(efeitoDaTroca(10, 1, "finalizada")).not.toBe(10);
  });

  it("quantidade maior que 1 baixa tudo", () => {
    expect(efeitoDaTroca(10, 3, "finalizada")).toBe(7);
  });

  it("o efeito total de uma venda com troca é duas unidades fora", () => {
    // venda: 10 → 9. troca finalizada: 9 → 8. Uma venda, duas peças saídas —
    // é exatamente o prejuízo do defeito, e ele precisa aparecer no estoque.
    const aposVenda = 10 - 1;
    expect(efeitoDaTroca(aposVenda, 1, "finalizada")).toBe(8);
  });
});
