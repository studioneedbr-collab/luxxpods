import { describe, expect, it } from "vitest";
import { aceitouOferta, escolherOferta, type RegraAplicavel } from "./upsell";

const regra = (extra: Partial<RegraAplicavel> = {}): RegraAplicavel => ({
  id: "r1", nome: "Leve 2", produto_origem: "prod-1", produto_destino: "prod-1",
  produto_destino_nome: "Ignite V300",
  mensagem: "Quer levar mais um com R$ 15 de desconto?",
  tipo_desconto: "valor", desconto: 15, prioridade: 1, status: "ativo", ...extra,
});

const carrinho = [{ product_id: "prod-1", produto: "Ignite V300", preco: 89.9, quantidade: 1 }];

describe("escolher a oferta", () => {
  it("oferece a regra que casa com o carrinho", () => {
    const o = escolherOferta([regra()], carrinho, []);
    expect(o?.regra.id).toBe("r1");
    expect(o?.descontoEmReais).toBe(15);
  });

  it("calcula desconto percentual sobre o preço do item", () => {
    const o = escolherOferta([regra({ tipo_desconto: "percentual", desconto: 10 })], carrinho, []);
    expect(o?.descontoEmReais).toBe(8.99);
  });

  it("respeita a prioridade quando mais de uma casa", () => {
    const o = escolherOferta(
      [regra({ id: "r2", prioridade: 5 }), regra({ id: "r3", prioridade: 2 })],
      carrinho, []);
    expect(o?.regra.id).toBe("r3");
  });

  // insistir é o que faz o cliente abandonar o carrinho
  it("NÃO repete oferta já feita nesta conversa", () => {
    expect(escolherOferta([regra()], carrinho, ["r1"])).toBeNull();
  });

  it("ignora regra desligada", () => {
    expect(escolherOferta([regra({ status: "inativo" })], carrinho, [])).toBeNull();
  });

  it("ignora regra de outro produto", () => {
    expect(escolherOferta([regra({ produto_origem: "prod-99" })], carrinho, [])).toBeNull();
  });

  it("regra sem produto de origem vale para qualquer carrinho", () => {
    expect(escolherOferta([regra({ produto_origem: null })], carrinho, [])).not.toBeNull();
  });

  it("não oferece nada com carrinho vazio", () => {
    expect(escolherOferta([regra()], [], [])).toBeNull();
  });

  it("respeita o período da campanha", () => {
    const agora = new Date("2026-09-23");
    expect(escolherOferta([regra({ fim: "2026-09-01" })], carrinho, [], agora)).toBeNull();
    expect(escolherOferta([regra({ inicio: "2026-10-01" })], carrinho, [], agora)).toBeNull();
    expect(escolherOferta([regra({ inicio: "2026-09-01", fim: "2026-12-31" })], carrinho, [], agora))
      .not.toBeNull();
  });

  // desconto errado no cadastro não pode virar venda de graça
  it("recusa desconto que zera ou passa do preço", () => {
    expect(escolherOferta([regra({ desconto: 89.9 })], carrinho, [])).toBeNull();
    expect(escolherOferta([regra({ desconto: 200 })], carrinho, [])).toBeNull();
    expect(escolherOferta([regra({ desconto: 0 })], carrinho, [])).toBeNull();
  });
});

describe("o cliente aceitou?", () => {
  it("entende as formas de aceitar", () => {
    ["sim", "quero", "pode adicionar", "bora", "manda", "aceito", "beleza"]
      .forEach((t) => expect(aceitouOferta(t), `"${t}"`).toBe(true));
  });

  // cobrar por oferta não pedida vira reclamação e troca
  it("entende as formas de recusar", () => {
    ["não", "nao quero", "deixa", "só isso", "tá bom assim", "obrigado"]
      .forEach((t) => expect(aceitouOferta(t), `"${t}"`).toBe(false));
  });

  it("dúvida não é aceite", () => {
    expect(aceitouOferta("quanto fica?")).toBe(false);
    expect(aceitouOferta("hmm")).toBe(false);
    expect(aceitouOferta("")).toBe(false);
  });
});
